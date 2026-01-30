const createError = require('http-errors');
const { dbTx } = require('../db/query');
const { emitDeliveryUpdateForOrder } = require('./realtime');

/**
 * Generates a human-friendly order number.
 */
function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

/**
 * PUBLIC_INTERFACE
 * placeOrder converts active cart into an order (guest checkout supported).
 */
async function placeOrder({ guestToken, guestEmail, shipping }) {
  return dbTx(async (conn) => {
    const [cartRows] = await conn.query(
      'SELECT id FROM carts WHERE guest_token = ? AND status = \'active\' LIMIT 1',
      [guestToken]
    );
    const cart = cartRows[0];
    if (!cart) throw createError(404, 'Cart not found');

    const [cartItems] = await conn.query(
      `
      SELECT
        ci.id,
        ci.product_id,
        ci.quantity,
        ci.unit_price_cents,
        p.sku,
        p.name,
        p.stock_qty,
        p.is_active,
        p.currency
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC
      `,
      [cart.id]
    );

    if (!cartItems.length) throw createError(400, 'Cart is empty');

    // Validate stock atomically
    for (const it of cartItems) {
      if (!it.is_active) throw createError(409, `Product unavailable: ${it.name}`);
      if (Number(it.stock_qty) < Number(it.quantity)) {
        throw createError(409, `Insufficient stock: ${it.name}`);
      }
    }

    const subtotalCents = cartItems.reduce(
      (sum, it) => sum + Number(it.unit_price_cents) * Number(it.quantity),
      0
    );
    const shippingCents = 0;
    const taxCents = 0;
    const totalCents = subtotalCents + shippingCents + taxCents;
    const currency = cartItems[0].currency || 'USD';

    const orderNumber = generateOrderNumber();

    const [orderInsert] = await conn.query(
      `
      INSERT INTO orders (
        order_number,
        guest_email,
        status,
        subtotal_cents,
        shipping_cents,
        tax_cents,
        total_cents,
        currency,
        shipping_name,
        shipping_phone,
        shipping_address1,
        shipping_address2,
        shipping_city,
        shipping_state,
        shipping_postal,
        shipping_country,
        placed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `,
      [
        orderNumber,
        guestEmail || null,
        'processing',
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        currency,
        shipping?.name || null,
        shipping?.phone || null,
        shipping?.address1 || null,
        shipping?.address2 || null,
        shipping?.city || null,
        shipping?.state || null,
        shipping?.postal || null,
        shipping?.country || null,
      ]
    );

    const orderId = orderInsert.insertId;

    // Create order_items snapshot
    for (const it of cartItems) {
      const lineTotal = Number(it.unit_price_cents) * Number(it.quantity);
      await conn.query(
        `
        INSERT INTO order_items (
          order_id, product_id, sku, name, quantity, unit_price_cents, line_total_cents
        ) VALUES (?,?,?,?,?,?,?)
        `,
        [
          orderId,
          it.product_id,
          it.sku,
          it.name,
          it.quantity,
          it.unit_price_cents,
          lineTotal,
        ]
      );

      // Decrement stock
      await conn.query('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [
        it.quantity,
        it.product_id,
      ]);
    }

    // Mark cart converted and clear items
    await conn.query('UPDATE carts SET status = \'converted\' WHERE id = ?', [cart.id]);
    await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);

    // Create delivery tracker
    const [trackerInsert] = await conn.query(
      `
      INSERT INTO delivery_trackers (order_id, current_status_code, last_event_at)
      VALUES (?, 'order_received', CURRENT_TIMESTAMP)
      `,
      [orderId]
    );
    const trackerId = trackerInsert.insertId;

    // Insert initial delivery event
    await conn.query(
      `
      INSERT INTO delivery_events (tracker_id, status_code, message, event_time)
      VALUES (?, 'order_received', 'Order received and is being prepared', CURRENT_TIMESTAMP)
      `,
      [trackerId]
    );

    // Emit update (best-effort) after DB writes
    await emitDeliveryUpdateForOrder(orderId);

    return {
      order_id: orderId,
      order_number: orderNumber,
      status: 'processing',
      totals: {
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency,
      },
      delivery: {
        tracker_id: trackerId,
        current_status_code: 'order_received',
      },
    };
  });
}

/**
 * PUBLIC_INTERFACE
 * getOrder returns order with items and delivery tracker.
 */
async function getOrder(orderId) {
  return dbTx(async (conn) => {
    const [orders] = await conn.query(
      `
      SELECT
        id,
        order_number,
        guest_email,
        status,
        subtotal_cents,
        shipping_cents,
        tax_cents,
        total_cents,
        currency,
        shipping_name,
        shipping_phone,
        shipping_address1,
        shipping_address2,
        shipping_city,
        shipping_state,
        shipping_postal,
        shipping_country,
        placed_at,
        created_at,
        updated_at
      FROM orders
      WHERE id = ?
      LIMIT 1
      `,
      [orderId]
    );

    const order = orders[0];
    if (!order) throw createError(404, 'Order not found');

    const [items] = await conn.query(
      `
      SELECT
        id,
        product_id,
        sku,
        name,
        quantity,
        unit_price_cents,
        line_total_cents,
        created_at
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
      `,
      [orderId]
    );

    const [trackers] = await conn.query(
      `
      SELECT
        id,
        order_id,
        tracking_number,
        carrier,
        current_status_code,
        last_event_at,
        eta_date,
        created_at,
        updated_at
      FROM delivery_trackers
      WHERE order_id = ?
      LIMIT 1
      `,
      [orderId]
    );

    return { order, items, delivery_tracker: trackers[0] || null };
  });
}

/**
 * PUBLIC_INTERFACE
 * listDeliveryEvents returns delivery events for an order.
 */
async function listDeliveryEvents(orderId) {
  return dbTx(async (conn) => {
    const [trackers] = await conn.query(
      'SELECT id FROM delivery_trackers WHERE order_id = ? LIMIT 1',
      [orderId]
    );
    const tracker = trackers[0];
    if (!tracker) throw createError(404, 'Delivery tracker not found');

    const [events] = await conn.query(
      `
      SELECT
        id,
        tracker_id,
        status_code,
        message,
        location,
        latitude,
        longitude,
        event_time,
        created_at
      FROM delivery_events
      WHERE tracker_id = ?
      ORDER BY event_time ASC, id ASC
      `,
      [tracker.id]
    );
    return { tracker_id: tracker.id, events };
  });
}

module.exports = {
  placeOrder,
  getOrder,
  listDeliveryEvents,
};

const createError = require('http-errors');
const { dbTx } = require('../db/query');

/**
 * Internal helper: fetch cart by guest token (create if missing).
 */
async function getOrCreateCart(conn, guestToken) {
  const [rows] = await conn.query(
    'SELECT id, guest_token, status, created_at, updated_at FROM carts WHERE guest_token = ? AND status = \'active\' LIMIT 1',
    [guestToken]
  );
  const existing = rows[0];
  if (existing) return existing;

  const [insert] = await conn.query(
    'INSERT INTO carts (guest_token, status) VALUES (?, \'active\')',
    [guestToken]
  );
  const cartId = insert.insertId;

  const [createdRows] = await conn.query(
    'SELECT id, guest_token, status, created_at, updated_at FROM carts WHERE id = ? LIMIT 1',
    [cartId]
  );
  return createdRows[0];
}

/**
 * PUBLIC_INTERFACE
 * getCart returns cart with expanded item/product details.
 */
async function getCart(guestToken) {
  return dbTx(async (conn) => {
    const cart = await getOrCreateCart(conn, guestToken);

    const [items] = await conn.query(
      `
      SELECT
        ci.id,
        ci.product_id,
        p.sku,
        p.name,
        p.image_url,
        p.currency,
        ci.quantity,
        ci.unit_price_cents,
        (ci.quantity * ci.unit_price_cents) AS line_total_cents,
        ci.created_at,
        ci.updated_at
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC
      `,
      [cart.id]
    );

    const subtotalCents = items.reduce(
      (sum, it) => sum + Number(it.line_total_cents || 0),
      0
    );

    return {
      cart: {
        id: cart.id,
        guest_token: cart.guest_token,
        status: cart.status,
        created_at: cart.created_at,
        updated_at: cart.updated_at,
      },
      items,
      pricing: {
        subtotal_cents: subtotalCents,
        currency: items[0]?.currency || 'USD',
      },
    };
  });
}

/**
 * PUBLIC_INTERFACE
 * addItem adds/increments a cart item.
 */
async function addItem(guestToken, productId, quantity) {
  return dbTx(async (conn) => {
    const cart = await getOrCreateCart(conn, guestToken);

    const [productRows] = await conn.query(
      'SELECT id, price_cents, currency, stock_qty, is_active FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    const product = productRows[0];
    if (!product || !product.is_active) throw createError(404, 'Product not found');
    if (product.stock_qty < quantity) throw createError(409, 'Insufficient stock');

    const [existingRows] = await conn.query(
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1',
      [cart.id, productId]
    );
    const existing = existingRows[0];

    if (existing) {
      const newQty = Number(existing.quantity) + quantity;
      if (product.stock_qty < newQty) throw createError(409, 'Insufficient stock');
      await conn.query(
        'UPDATE cart_items SET quantity = ?, unit_price_cents = ? WHERE id = ?',
        [newQty, product.price_cents, existing.id]
      );
    } else {
      await conn.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents) VALUES (?,?,?,?)',
        [cart.id, productId, quantity, product.price_cents]
      );
    }

    return getCart(guestToken);
  });
}

/**
 * PUBLIC_INTERFACE
 * updateItem updates item quantity (0 removes).
 */
async function updateItem(guestToken, itemId, quantity) {
  return dbTx(async (conn) => {
    const cart = await getOrCreateCart(conn, guestToken);

    const [itemRows] = await conn.query(
      'SELECT id, product_id FROM cart_items WHERE id = ? AND cart_id = ? LIMIT 1',
      [itemId, cart.id]
    );
    const item = itemRows[0];
    if (!item) throw createError(404, 'Cart item not found');

    if (quantity <= 0) {
      await conn.query('DELETE FROM cart_items WHERE id = ?', [itemId]);
      return getCart(guestToken);
    }

    const [productRows] = await conn.query(
      'SELECT id, stock_qty, price_cents, is_active FROM products WHERE id = ? LIMIT 1',
      [item.product_id]
    );
    const product = productRows[0];
    if (!product || !product.is_active) throw createError(404, 'Product not found');
    if (product.stock_qty < quantity) throw createError(409, 'Insufficient stock');

    await conn.query(
      'UPDATE cart_items SET quantity = ?, unit_price_cents = ? WHERE id = ?',
      [quantity, product.price_cents, itemId]
    );

    return getCart(guestToken);
  });
}

/**
 * PUBLIC_INTERFACE
 * removeItem deletes a cart item.
 */
async function removeItem(guestToken, itemId) {
  return dbTx(async (conn) => {
    const cart = await getOrCreateCart(conn, guestToken);
    await conn.query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [itemId, cart.id]);
    return getCart(guestToken);
  });
}

/**
 * PUBLIC_INTERFACE
 * clearCart removes all items from the cart.
 */
async function clearCart(guestToken) {
  return dbTx(async (conn) => {
    const cart = await getOrCreateCart(conn, guestToken);
    await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
    return getCart(guestToken);
  });
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};

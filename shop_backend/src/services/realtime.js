const WebSocket = require('ws');
const createError = require('http-errors');
const { dbTx } = require('../db/query');

/**
 * Map orderId -> Set<WebSocket>
 */
const orderSubscribers = new Map();

/**
 * Keep a reference to the ws server for broadcasting.
 */
let wss;

/**
 * Broadcast payload to all sockets subscribed to orderId.
 */
function broadcastToOrder(orderId, payload) {
  const subs = orderSubscribers.get(String(orderId));
  if (!subs || subs.size === 0) return;

  const data = JSON.stringify(payload);
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Fetch latest delivery state for an order from DB.
 */
async function getDeliverySnapshot(orderId) {
  return dbTx(async (conn) => {
    const [trackerRows] = await conn.query(
      `
      SELECT
        dt.id AS tracker_id,
        dt.order_id,
        dt.tracking_number,
        dt.carrier,
        dt.current_status_code,
        ds.name AS current_status_name,
        ds.description AS current_status_description,
        dt.last_event_at,
        dt.eta_date,
        dt.created_at,
        dt.updated_at
      FROM delivery_trackers dt
      LEFT JOIN delivery_statuses ds ON ds.code = dt.current_status_code
      WHERE dt.order_id = ?
      LIMIT 1
      `,
      [orderId]
    );
    const tracker = trackerRows[0];
    if (!tracker) throw createError(404, 'Delivery tracker not found');

    const [eventRows] = await conn.query(
      `
      SELECT
        id,
        status_code,
        message,
        location,
        latitude,
        longitude,
        event_time
      FROM delivery_events
      WHERE tracker_id = ?
      ORDER BY event_time DESC, id DESC
      LIMIT 1
      `,
      [tracker.tracker_id]
    );

    return {
      tracker,
      last_event: eventRows[0] || null,
    };
  });
}

/**
 * PUBLIC_INTERFACE
 * emitDeliveryUpdateForOrder fetches current delivery snapshot and broadcasts it.
 */
async function emitDeliveryUpdateForOrder(orderId) {
  try {
    const snapshot = await getDeliverySnapshot(orderId);
    broadcastToOrder(orderId, {
      type: 'delivery_update',
      order_id: Number(orderId),
      ...snapshot,
      emitted_at: new Date().toISOString(),
    });
  } catch (err) {
    // Best-effort; don't crash order placement or admin update.
    // eslint-disable-next-line no-console
    console.error('emitDeliveryUpdateForOrder error:', err?.message);
  }
}

/**
 * PUBLIC_INTERFACE
 * createDeliveryEvent creates an event and updates tracker current_status_code.
 */
async function createDeliveryEvent(orderId, event) {
  return dbTx(async (conn) => {
    const [trackerRows] = await conn.query(
      'SELECT id FROM delivery_trackers WHERE order_id = ? LIMIT 1',
      [orderId]
    );
    const tracker = trackerRows[0];
    if (!tracker) throw createError(404, 'Delivery tracker not found');

    // Validate status code exists
    const [statusRows] = await conn.query(
      'SELECT code FROM delivery_statuses WHERE code = ? LIMIT 1',
      [event.status_code]
    );
    if (!statusRows[0]) throw createError(400, 'Unknown delivery status_code');

    await conn.query(
      `
      INSERT INTO delivery_events (
        tracker_id, status_code, message, location, latitude, longitude, event_time
      ) VALUES (?,?,?,?,?,?, COALESCE(?, CURRENT_TIMESTAMP))
      `,
      [
        tracker.id,
        event.status_code,
        event.message || null,
        event.location || null,
        event.latitude || null,
        event.longitude || null,
        event.event_time || null,
      ]
    );

    await conn.query(
      `
      UPDATE delivery_trackers
      SET current_status_code = ?, last_event_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [event.status_code, tracker.id]
    );

    await emitDeliveryUpdateForOrder(orderId);

    return { ok: true };
  });
}

/**
 * PUBLIC_INTERFACE
 * initWebSocket attaches a WebSocket server to an existing HTTP server.
 *
 * Protocol:
 * - Client connects to ws://host:port/ws
 * - Client sends: {"type":"subscribe","order_id":123}
 * - Server replies with a snapshot: {"type":"delivery_snapshot", ...}
 *
 * Notes:
 * - No auth is enforced in this template; production should validate user ownership.
 */
function initWebSocket(httpServer) {
  wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      if (msg.type === 'subscribe' && msg.order_id) {
        const orderId = String(msg.order_id);
        if (!orderSubscribers.has(orderId)) orderSubscribers.set(orderId, new Set());
        orderSubscribers.get(orderId).add(ws);

        // Send initial snapshot
        try {
          const snapshot = await getDeliverySnapshot(orderId);
          ws.send(
            JSON.stringify({
              type: 'delivery_snapshot',
              order_id: Number(orderId),
              ...snapshot,
              emitted_at: new Date().toISOString(),
            })
          );
        } catch (err) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: err.message || 'Unable to subscribe',
            })
          );
        }
        return;
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
        return;
      }

      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    });

    ws.on('close', () => {
      // Remove ws from all subscriber sets
      for (const subs of orderSubscribers.values()) subs.delete(ws);
    });
  });

  return wss;
}

module.exports = {
  initWebSocket,
  emitDeliveryUpdateForOrder,
  createDeliveryEvent,
};

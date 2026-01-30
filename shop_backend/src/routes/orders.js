const express = require('express');
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const ordersService = require('../services/orders');
const { createDeliveryEvent } = require('../services/realtime');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Orders
 *     description: Checkout and order management
 */

/**
 * @swagger
 * /checkout:
 *   post:
 *     tags: [Orders]
 *     summary: Checkout cart -> create order
 *     description: Guest checkout using X-Guest-Token cart identifier.
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guest_email, shipping]
 *             properties:
 *               guest_email: { type: string, example: "guest@example.com" }
 *               shipping:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   phone: { type: string }
 *                   address1: { type: string }
 *                   address2: { type: string }
 *                   city: { type: string }
 *                   state: { type: string }
 *                   postal: { type: string }
 *                   country: { type: string, example: "US" }
 *     responses:
 *       200:
 *         description: Order created
 */
router.post(
  '/checkout',
  validate({
    body: z.object({
      guest_email: z.string().email(),
      shipping: z.object({
        name: z.string().min(1).optional(),
        phone: z.string().min(3).optional(),
        address1: z.string().min(1),
        address2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().min(1).optional(),
        postal: z.string().min(1).optional(),
        country: z.string().length(2).optional(),
      }),
    }),
  }),
  asyncHandler(async (req, res) => {
    const guestToken = req.get('X-Guest-Token');
    if (!guestToken) {
      res.status(400).json({ status: 'error', message: 'Missing X-Guest-Token' });
      return;
    }
    const result = await ordersService.placeOrder({
      guestToken,
      guestEmail: req.body.guest_email,
      shipping: req.body.shipping,
    });
    res.json(result);
  })
);

/**
 * @swagger
 * /orders/{orderId}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order details (items + delivery tracker)
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Order details }
 *       404: { description: Not found }
 */
router.get(
  '/orders/:orderId',
  validate({ params: z.object({ orderId: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const result = await ordersService.getOrder(req.params.orderId);
    res.json(result);
  })
);

/**
 * @swagger
 * /orders/{orderId}/delivery/events:
 *   get:
 *     tags: [Orders]
 *     summary: List delivery events for an order
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Event history }
 */
router.get(
  '/orders/:orderId/delivery/events',
  validate({ params: z.object({ orderId: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const result = await ordersService.listDeliveryEvents(req.params.orderId);
    res.json(result);
  })
);

/**
 * Admin/testing endpoint to create delivery events (and broadcast via WebSocket).
 *
 * @swagger
 * /orders/{orderId}/delivery/events:
 *   post:
 *     tags: [Orders]
 *     summary: Create delivery event (admin/testing)
 *     description: Creates a delivery event, updates current tracker status, persists to DB, broadcasts to subscribers.
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status_code]
 *             properties:
 *               status_code: { type: string, example: "shipped" }
 *               message: { type: string, example: "Left the warehouse" }
 *               location: { type: string, example: "Los Angeles, CA" }
 *               latitude: { type: number, example: 34.0522 }
 *               longitude: { type: number, example: -118.2437 }
 *               event_time: { type: string, format: date-time }
 *     responses:
 *       200: { description: Created }
 */
router.post(
  '/orders/:orderId/delivery/events',
  validate({
    params: z.object({ orderId: z.coerce.number().int().positive() }),
    body: z.object({
      status_code: z.string().min(1).max(32),
      message: z.string().max(255).optional(),
      location: z.string().max(255).optional(),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      event_time: z.string().datetime().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await createDeliveryEvent(req.params.orderId, req.body);
    res.json(result);
  })
);

module.exports = router;

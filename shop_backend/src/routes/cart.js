const express = require('express');
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const cartService = require('../services/cart');

const router = express.Router();

/**
 * Extract guest token from header or query.
 */
function getGuestToken(req) {
  return req.get('X-Guest-Token') || req.query.guest_token;
}

/**
 * @swagger
 * tags:
 *   - name: Cart
 *     description: Cart CRUD using a guest token (no auth)
 */

/**
 * @swagger
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get current cart
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         schema: { type: string, example: "550e8400-e29b-41d4-a716-446655440000" }
 *         required: true
 *         description: Guest token identifying the cart
 *     responses:
 *       200: { description: Cart state }
 *       400: { description: Missing guest token }
 */
router.get(
  '/',
  validate({
    query: z.object({
      guest_token: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      res.status(400).json({ status: 'error', message: 'Missing X-Guest-Token (or guest_token query param)' });
      return;
    }
    const cart = await cartService.getCart(guestToken);
    res.json(cart);
  })
);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Add item to cart
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         schema: { type: string }
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_id, quantity]
 *             properties:
 *               product_id: { type: integer, example: 1 }
 *               quantity: { type: integer, example: 2 }
 *     responses:
 *       200: { description: Updated cart }
 */
router.post(
  '/items',
  validate({
    query: z.object({ guest_token: z.string().uuid().optional() }),
    body: z.object({
      product_id: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1).max(99),
    }),
  }),
  asyncHandler(async (req, res) => {
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      res.status(400).json({ status: 'error', message: 'Missing X-Guest-Token (or guest_token query param)' });
      return;
    }
    const cart = await cartService.addItem(guestToken, req.body.product_id, req.body.quantity);
    res.json(cart);
  })
);

/**
 * @swagger
 * /cart/items/{itemId}:
 *   put:
 *     tags: [Cart]
 *     summary: Update cart item quantity (0 removes)
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         schema: { type: string }
 *         required: true
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity: { type: integer, example: 3 }
 *     responses:
 *       200: { description: Updated cart }
 */
router.put(
  '/items/:itemId',
  validate({
    query: z.object({ guest_token: z.string().uuid().optional() }),
    params: z.object({ itemId: z.coerce.number().int().positive() }),
    body: z.object({
      quantity: z.coerce.number().int().min(0).max(99),
    }),
  }),
  asyncHandler(async (req, res) => {
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      res.status(400).json({ status: 'error', message: 'Missing X-Guest-Token (or guest_token query param)' });
      return;
    }
    const cart = await cartService.updateItem(guestToken, req.params.itemId, req.body.quantity);
    res.json(cart);
  })
);

/**
 * @swagger
 * /cart/items/{itemId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove cart item
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         schema: { type: string }
 *         required: true
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated cart }
 */
router.delete(
  '/items/:itemId',
  validate({
    query: z.object({ guest_token: z.string().uuid().optional() }),
    params: z.object({ itemId: z.coerce.number().int().positive() }),
  }),
  asyncHandler(async (req, res) => {
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      res.status(400).json({ status: 'error', message: 'Missing X-Guest-Token (or guest_token query param)' });
      return;
    }
    const cart = await cartService.removeItem(guestToken, req.params.itemId);
    res.json(cart);
  })
);

/**
 * @swagger
 * /cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear cart
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: Updated cart }
 */
router.delete(
  '/',
  validate({
    query: z.object({ guest_token: z.string().uuid().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const guestToken = getGuestToken(req);
    if (!guestToken) {
      res.status(400).json({ status: 'error', message: 'Missing X-Guest-Token (or guest_token query param)' });
      return;
    }
    const cart = await cartService.clearCart(guestToken);
    res.json(cart);
  })
);

module.exports = router;

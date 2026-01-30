const express = require('express');
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const createError = require('http-errors');
const { validate } = require('../middleware/validate');
const productsService = require('../services/products');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Products
 *     description: Product catalog browsing APIs
 */

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products
 *     description: Returns active products with optional search and category filter.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search string matched against name or SKU
 *       - in: query
 *         name: category_id
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 24 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, example: 0 }
 *     responses:
 *       200:
 *         description: A list of products
 */
router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await productsService.listProducts({
      q: req.query.q,
      categoryId: req.query.category_id,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  })
);

/**
 * @swagger
 * /products/categories:
 *   get:
 *     tags: [Products]
 *     summary: List product categories
 *     responses:
 *       200:
 *         description: A list of categories
 */
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await productsService.listCategories();
    res.json({ items: categories });
  })
);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Product
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const product = await productsService.getProduct(req.params.id);
    if (!product || !product.is_active) throw createError(404, 'Product not found');
    res.json(product);
  })
);

module.exports = router;

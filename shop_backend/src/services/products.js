const { dbQuery } = require('../db/query');

/**
 * PUBLIC_INTERFACE
 * listCategories returns product categories.
 */
async function listCategories() {
  const rows = await dbQuery(
    'SELECT id, slug, name, created_at FROM product_categories ORDER BY name ASC'
  );
  return rows;
}

/**
 * PUBLIC_INTERFACE
 * listProducts returns a filtered/paginated list of active products.
 */
async function listProducts({ q, categoryId, limit, offset } = {}) {
  const where = ['p.is_active = 1'];
  const params = [];

  if (q) {
    where.push('(p.name LIKE ? OR p.sku LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(categoryId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await dbQuery(
    `
    SELECT
      p.id,
      p.category_id,
      c.slug AS category_slug,
      c.name AS category_name,
      p.sku,
      p.name,
      p.description,
      p.price_cents,
      p.currency,
      p.image_url,
      p.stock_qty,
      p.is_active,
      p.created_at,
      p.updated_at
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    ${whereSql}
    ORDER BY p.created_at DESC
    LIMIT ?
    OFFSET ?
    `,
    [...params, limit, offset]
  );

  const countRows = await dbQuery(
    `
    SELECT COUNT(*) AS total
    FROM products p
    ${whereSql}
    `,
    params
  );

  return {
    items: rows,
    total: Number(countRows?.[0]?.total || 0),
    limit,
    offset,
  };
}

/**
 * PUBLIC_INTERFACE
 * getProduct returns a single active product by id.
 */
async function getProduct(productId) {
  const rows = await dbQuery(
    `
    SELECT
      p.id,
      p.category_id,
      c.slug AS category_slug,
      c.name AS category_name,
      p.sku,
      p.name,
      p.description,
      p.price_cents,
      p.currency,
      p.image_url,
      p.stock_qty,
      p.is_active,
      p.created_at,
      p.updated_at
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    WHERE p.id = ?
    LIMIT 1
    `,
    [productId]
  );
  return rows[0] || null;
}

module.exports = {
  listCategories,
  listProducts,
  getProduct,
};

const createError = require('http-errors');

/**
 * PUBLIC_INTERFACE
 * validate validates req.{body,query,params} against a Zod schema.
 * Usage: router.post('/x', validate({ body: schema }), handler)
 */
function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      if (params) req.params = params.parse(req.params);
      return next();
    } catch (err) {
      // ZodError
      const details = err?.issues?.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(createError(400, 'Validation error', { details }));
    }
  };
}

module.exports = {
  validate,
};

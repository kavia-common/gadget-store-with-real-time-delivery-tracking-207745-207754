/**
 * Express error handler that formats http-errors into JSON.
 */
/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  const payload = {
    status: 'error',
    message: err.message || 'Internal Server Error',
  };

  if (err.details) payload.details = err.details;

  // eslint-disable-next-line no-console
  console.error('API error:', {
    status,
    message: err.message,
    stack: err.stack,
    details: err.details,
  });

  res.status(status).json(payload);
}

module.exports = {
  errorHandler,
};

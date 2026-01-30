const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');
const { errorHandler } = require('./middleware/errorHandler');

// Initialize express app
const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header) and same-origin.
    if (!origin) return callback(null, true);

    // Preserve wildcard behavior.
    if (allowedOrigins.includes('*')) return callback(null, true);

    // Explicit allow-list.
    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  methods: (process.env.ALLOWED_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS').split(','),
  allowedHeaders: (process.env.ALLOWED_HEADERS || 'Content-Type,Authorization').split(','),
  maxAge: process.env.CORS_MAX_AGE ? Number(process.env.CORS_MAX_AGE) : undefined,
}));

app.set('trust proxy', true);

app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const host = req.get('host'); // may or may not include port
  let protocol = req.protocol; // http or https

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
     (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

// Central error handler
app.use(errorHandler);

module.exports = app;

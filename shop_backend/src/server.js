const app = require('./app');
const { initWebSocket } = require('./services/realtime');

/**
 * Server entrypoint.
 * Starts the HTTP server and attaches WebSocket server at /ws for delivery tracking.
 */
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://${HOST}:${PORT}`);
});

// Attach WebSocket server
initWebSocket(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  // eslint-disable-next-line no-console
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = server;

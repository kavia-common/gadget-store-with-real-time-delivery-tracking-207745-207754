const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Gadget Store API',
      version: '1.0.0',
      description: `
REST API for the Gadget Store (products, cart, checkout/orders) plus real-time delivery tracking.

Real-time Delivery Tracking (WebSocket):
- Connect to: ws(s)://<host>/ws
- Send: {"type":"subscribe","order_id":123}
- Receive: "delivery_snapshot" immediately + subsequent "delivery_update" messages whenever delivery status is updated.
`,
    },
    tags: [
      { name: 'Products', description: 'Product catalog browsing APIs' },
      { name: 'Cart', description: 'Cart CRUD using a guest token (no auth)' },
      { name: 'Orders', description: 'Checkout and order management' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;

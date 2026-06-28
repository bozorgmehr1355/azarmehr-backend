/**
 * Azarmehr Backend — Express server for Render.com
 *
 * Converts Vercel serverless functions (module.exports = (req, res) => {...})
 * to an Express app while keeping ALL original logic intact.
 *
 * Each handler is mounted with app.all() + app.all('/*') so that:
 *   - req.url preserves the full path (handlers parse their own sub-routes)
 *   - req.body, req.query, req.method work identically to Vercel
 */

const express = require('express');
const path = require('path');

// ─── Load .env for local dev (no-op in production) ─────────────────
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// ───────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────

// Parse JSON bodies (matches Vercel's auto-parsed req.body)
app.use(express.json());

// CORS — handles OPTIONS preflight before any handler sees the request
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ───────────────────────────────────────────
// Route helpers
// ───────────────────────────────────────────

/**
 * Mount a Vercel-style handler on an Express route.
 * Uses app.all() + app.all('/*') so that:
 *   - The exact path runs the handler (e.g. /api/users)
 *   - Sub-paths also run the handler (e.g. /api/users/reset-password)
 *   - req.url remains the FULL original URL (handlers parse sub-paths themselves)
 */
function mount(basePath, handler) {
  app.all(basePath, (req, res) => handler(req, res));
  app.all(path.posix.join(basePath, '/*'), (req, res) => handler(req, res));
}

// ───────────────────────────────────────────
// API Routes — each mounts the original
// Vercel handler without ANY logic change
// ───────────────────────────────────────────

// Load all handlers from handlers/ (api/ now has only the Vercel entry-point index.js)
const handlers = {
  login:                   require('./handlers/login'),
  portalLogin:             require('./handlers/portal-login'),
  portalRegister:          require('./handlers/portal-register'),
  users:                   require('./handlers/users'),
  crmCustomers:            require('./handlers/crm-customers'),
  crmOrders:               require('./handlers/crm-orders'),
  crmOrderItems:           require('./handlers/crm-order-items'),
  crmOrderStatusLog:       require('./handlers/crm-order-status-log'),
  crmOrderTasks:           require('./handlers/crm-order-tasks'),
  crmOrderToProject:       require('./handlers/crm-order-to-project'),
  crmCommunications:       require('./handlers/crm-communications'),
  crmPayments:             require('./handlers/crm-payments'),
  crmPaymentsAdmin:        require('./handlers/crm-payments-admin'),
  crmPaymentSubmit:        require('./handlers/crm-payment-submit'),
  crmPaymentVerify:        require('./handlers/crm-payment-verify'),
  crmProformaIssue:        require('./handlers/crm-proforma-issue'),
  crmProformaApprove:      require('./handlers/crm-proforma-approve'),
  crmInvoices:             require('./handlers/crm-invoices'),
  crmGuaranteeClaims:      require('./handlers/crm-guarantee-claims'),
  projects:                require('./handlers/projects'),
  projectTasks:            require('./handlers/project-tasks'),
  projectMembers:          require('./handlers/project-members'),
  documents:               require('./handlers/documents'),
  chat:                    require('./handlers/chat'),
  notifications:           require('./handlers/notifications'),
  requests:                require('./handlers/requests'),
  payments:                require('./handlers/payments'),
  settings:                require('./handlers/settings'),
  products:                require('./handlers/products'),
  scorpionCustomers:       require('./handlers/scorpion-customers'),
  orgChart:                require('./handlers/org-chart'),
  portalRegistrationRequests: require('./handlers/portal-registration-requests'),
  setup:                   require('./handlers/setup'),
  debug:                   require('./handlers/debug'),
};

// Mount every endpoint
mount('/api/login',                      handlers.login);
mount('/api/portal-login',               handlers.portalLogin);
mount('/api/portal-register',            handlers.portalRegister);
mount('/api/users',                      handlers.users);
mount('/api/crm-customers',              handlers.crmCustomers);
mount('/api/crm-orders',                 handlers.crmOrders);
mount('/api/crm-order-items',            handlers.crmOrderItems);
mount('/api/crm-order-status-log',       handlers.crmOrderStatusLog);
mount('/api/crm-order-tasks',            handlers.crmOrderTasks);
mount('/api/crm-order-to-project',       handlers.crmOrderToProject);
mount('/api/crm-communications',         handlers.crmCommunications);
mount('/api/crm-payments',               handlers.crmPayments);
mount('/api/crm-payments-admin',         handlers.crmPaymentsAdmin);
mount('/api/crm-payment-submit',         handlers.crmPaymentSubmit);
mount('/api/crm-payment-verify',         handlers.crmPaymentVerify);
mount('/api/crm-proforma-issue',         handlers.crmProformaIssue);
mount('/api/crm-proforma-approve',       handlers.crmProformaApprove);
mount('/api/crm-invoices',               handlers.crmInvoices);
mount('/api/crm-guarantee-claims',        handlers.crmGuaranteeClaims);
mount('/api/projects',                   handlers.projects);
mount('/api/project-tasks',              handlers.projectTasks);
mount('/api/project-members',            handlers.projectMembers);
mount('/api/documents',                  handlers.documents);
mount('/api/chat',                       handlers.chat);
mount('/api/notifications',              handlers.notifications);
mount('/api/requests',                   handlers.requests);
mount('/api/payments',                   handlers.payments);
mount('/api/settings',                   handlers.settings);
mount('/api/products',                   handlers.products);
mount('/api/scorpion-customers',         handlers.scorpionCustomers);
mount('/api/org-chart',                  handlers.orgChart);
mount('/api/portal-registration-requests', handlers.portalRegistrationRequests);
mount('/api/setup',                      handlers.setup);
mount('/api/debug',                      handlers.debug);

// Root catch-all — returns route listing
app.all('/', (req, res) => {
  res.json({
    ok: true,
    service: 'azarmehr-backend',
    routes: Object.keys(handlers).map(k => `/api/${k}`),
  });
});

// ───────────────────────────────────────────
// Start
// ───────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Azarmehr Backend running on port ${PORT}`);
  console.log(`   Base URL: http://0.0.0.0:${PORT}`);
  console.log(`   APIs:     http://0.0.0.0:${PORT}/api/login`);
});

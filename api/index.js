/**
 * api/index.js — Single serverless function that routes to all handlers.
 *
 * On Vercel Hobby plan, every .js in api/ becomes a separate function
 * (limit: 12). This file is the ONLY function; it routes internally
 * using Express so the 12-function cap is never hit.
 *
 * All handler files live in ../handlers/ (outside api/ directory).
 */

const express = require('express');
const path = require('path');

// ── Load env ──────────────────────────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Build Express app (cached across warm invocations) ────────────
const app = express();
app.use(express.json());

// ── CORS middleware ───────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (_req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── Mount all handlers from ../handlers/ ──────────────────────────
const H = (name) => require(path.join(__dirname, '..', 'handlers', name));

const routes = [
  ['/api/login',                        H('login')],
  ['/api/portal-login',                 H('portal-login')],
  ['/api/portal-register',              H('portal-register')],
  ['/api/users',                        H('users')],
  ['/api/crm-customers',                H('crm-customers')],
  ['/api/crm-orders',                   H('crm-orders')],
  ['/api/crm-order-items',              H('crm-order-items')],
  ['/api/crm-order-status-log',         H('crm-order-status-log')],
  ['/api/crm-order-tasks',              H('crm-order-tasks')],
  ['/api/crm-order-to-project',         H('crm-order-to-project')],
  ['/api/crm-communications',           H('crm-communications')],
  ['/api/crm-payments',                 H('crm-payments')],
  ['/api/crm-payments-admin',           H('crm-payments-admin')],
  ['/api/crm-payment-submit',           H('crm-payment-submit')],
  ['/api/crm-payment-verify',           H('crm-payment-verify')],
  ['/api/crm-proforma-issue',           H('crm-proforma-issue')],
  ['/api/crm-proforma-approve',         H('crm-proforma-approve')],
  ['/api/crm-invoices',                 H('crm-invoices')],
  ['/api/crm-guarantee-claims',         H('crm-guarantee-claims')],
  ['/api/projects',                     H('projects')],
  ['/api/project-tasks',                H('project-tasks')],
  ['/api/project-members',              H('project-members')],
  ['/api/documents',                    H('documents')],
  ['/api/chat',                         H('chat')],
  ['/api/notifications',                H('notifications')],
  ['/api/requests',                     H('requests')],
  ['/api/payments',                     H('payments')],
  ['/api/settings',                     H('settings')],
  ['/api/products',                     H('products')],
  ['/api/scorpion-customers',           H('scorpion-customers')],
  ['/api/org-chart',                    H('org-chart')],
  ['/api/portal-registration-requests', H('portal-registration-requests')],
  ['/api/setup',                        H('setup')],
  ['/api/debug',                        H('debug')],
];

for (const [route, handler] of routes) {
  // Exact match
  app.all(route, (req, res) => handler(req, res));
  // Sub-path match (e.g. /api/users/reset-password)
  app.all(route + '/*', (req, res) => handler(req, res));
}

// ── Root / fallback ───────────────────────────────────────────────
app.all('*', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'azarmehr-backend',
    routes: routes.map(([r]) => r),
  });
});

// ── Export for Vercel serverless ──────────────────────────────────
module.exports = app;

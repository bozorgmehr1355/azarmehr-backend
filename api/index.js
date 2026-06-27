module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    service: 'azarmehr-backend',
    routes: [
      '/api/login',
      '/api/users',
      '/api/requests',
      '/api/payments',
      '/api/notifications',
      '/api/documents',
      '/api/chat',
      '/api/crm-customers',
      '/api/crm-orders',
      '/api/crm-communications',
      '/api/crm-order-items',
      '/api/crm-order-status-log',
      '/api/portal-login',
      '/api/portal-register',
      '/api/crm-proforma-approve',
      '/api/crm-proforma-issue',
      '/api/crm-payment-submit',
      '/api/crm-order-to-project',
      '/api/crm-order-tasks',
      '/api/crm-payments-admin',
      '/api/crm-payment-verify',
      '/api/portal-registration-requests',
      '/api/projects',
      '/api/project-tasks',
      '/api/project-members',
      '/api/settings',
      '/api/org-chart',
      '/api/setup'
    ]
  }));
};

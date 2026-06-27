module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const results = {};

  // Test 1: env vars
  results.env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_KEY: !!process.env.SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: !!process.env.JWT_SECRET,
    POSTGRES_URL: !!process.env.POSTGRES_URL,
  };

  // Test 2: require packages
  try { require('bcryptjs'); results.bcryptjs = 'ok'; } catch(e) { results.bcryptjs = e.message; }
  try { require('jsonwebtoken'); results.jsonwebtoken = 'ok'; } catch(e) { results.jsonwebtoken = e.message; }
  try { require('@supabase/supabase-js'); results.supabase = 'ok'; } catch(e) { results.supabase = e.message; }

  // Test 3: _lib
  try { require('./_lib'); results._lib = 'ok'; } catch(e) { results._lib = e.message; }

  res.end(JSON.stringify(results, null, 2));
};

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { throw new Error('JWT_SECRET env var is required'); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function cors(req, res) {
  if (res === undefined) {
    res = req;
    req = { method: null };
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return true;
  }
  return false;
}

function requireAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    const err = new Error('لطفاً وارد شوید');
    err.status = 401;
    throw err;
  }
  const token = auth.substring(7); // ✅ اصلاح شده: const به جای cost
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (e) {
    const err = new Error('توکن نامعتبر است');
    err.status = 401;
    throw err;
  }
}

function requireRole(req, allowedRoles) {
  const user = requireAuth(req);
  if (!allowedRoles.includes(user.system_role)) {
    const err = new Error('شما دسترسی لازم را ندارید');
    err.status = 403;
    throw err;
  }
  return user;
}

function requireAdmin(req) {
  return requireRole(req, ['super_admin', 'admin']);
}

function requireSuperAdmin(req) {
  return requireRole(req, ['super_admin']);
}

module.exports = {
  supabase,
  cors,
  bcrypt,
  jwt,
  JWT_SECRET,
  requireAuth,
  requireRole,
  requireAdmin,
  requireSuperAdmin
};

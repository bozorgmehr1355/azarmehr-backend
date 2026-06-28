const { supabase, jwt, JWT_SECRET, cors } = require('./_lib');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'nam karbar va ramz lazem ast' });
    }
    const { data: customer, error } = await supabase
      .from('crm_customers')
      .select('*')
      .eq('portal_username', username)
      .eq('portal_active', true)
      .single();
    if (error || !customer) {
      return res.status(401).json({ success: false, message: 'نام کاربری یا رمز عبور نادرست است' });
    }
    const stored = customer.portal_password || '';
    const isHashed = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
    const ok = isHashed
      ? bcrypt.compareSync(password, stored)
      : stored === password; // TODO: migrate all passwords to bcrypt
    if (!ok) {
      return res.status(401).json({ error: 'username or password incorrect' });
    }
    const token = jwt.sign(
      { id: customer.id, username: customer.portal_username, type: 'customer' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.status(200).json({
      token,
      user: {
        id: customer.id,
        name: customer.name || customer.full_name || customer.portal_username,
        username: customer.portal_username,
        type: 'customer'
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Internal server error', details: e.message });
  }
};

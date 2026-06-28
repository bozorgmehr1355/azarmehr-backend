const { supabase, jwt, JWT_SECRET, cors, requireAuth, requireAdmin } = require('./_lib');
const bcrypt = require('bcryptjs');

/**
 * Portal Registration Requests API
 * ─────────────────────────────────────────────
 * GET    → لیست درخواست‌های pending
 * POST   → تأیید یک درخواست (ایجاد username/password + فعال کردن)
 * DELETE → رد کردن یک درخواست
 */
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);
    requireAdmin(req);

    // ── GET: List pending requests ────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .eq('customer_status', 'new')
        .eq('portal_active', false)
        .is('portal_password', null)
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ── POST: Approve a request ───────────────────────────────
    if (req.method === 'POST') {
      const { id, portal_username, portal_password } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });
      if (!portal_username) return res.status(400).json({ error: 'نام کاربری پورتال الزامی است' });
      if (!portal_password) return res.status(400).json({ error: 'رمز عبور پورتال الزامی است' });

      // Check username uniqueness
      const { data: existing } = await supabase
        .from('crm_customers')
        .select('id')
        .eq('portal_username', portal_username)
        .neq('id', id)
        .single();

      if (existing) {
        return res.status(409).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
      }

      const hashedPassword = bcrypt.hashSync(portal_password, 10);

      const { data: updated, error } = await supabase
        .from('crm_customers')
        .update({
          portal_username,
          portal_password: hashedPassword,
          portal_active: true,
          customer_status: 'active',
        })
        .eq('id', id)
        .eq('customer_status', 'new')
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!updated) return res.status(404).json({ error: 'درخواست پیدا نشد یا قبلاً تأیید شده' });

      return res.json({
        success: true,
        message: 'درخواست تأیید شد. کاربر می‌تواند وارد پورتال شود.',
        customer: updated,
        credentials: {
          username: portal_username,
          password: portal_password, // plain-text for admin to share
        },
      });
    }

    // ── DELETE: Reject a request ──────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      // Instead of deleting, mark as rejected
      const { error } = await supabase
        .from('crm_customers')
        .update({
          customer_status: 'rejected',
          portal_active: false,
        })
        .eq('id', id)
        .eq('customer_status', 'new');

      if (error) return res.status(500).json({ error: error.message });

      return res.json({ success: true, message: 'درخواست رد شد' });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

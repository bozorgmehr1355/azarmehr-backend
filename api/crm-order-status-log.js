const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');
const ALLOWED_FIELDS = new Set(['order_id', 'from_status', 'to_status', 'changed_by', 'note']);

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  try {
    requireAuth(req);

    // GET: لاگ‌های وضعیت یک سفارش بر اساس order_id
    if (req.method === 'GET') {
      const { order_id } = req.query;
      if (!order_id) return res.status(400).json({ error: 'order_id الزامی است' });

      const { data, error } = await supabase
        .from('crm_order_status_log')
        .select('*')
        .eq('order_id', parseInt(String(order_id).replace(/^eq\./, '')))
        .order('created_at', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST: ثبت لاگ جدید — فقط admin+
    if (req.method === 'POST') {
      requireAdmin(req);

      const sanitized = {};
      for (const key of Object.keys(req.body || {})) {
        if (ALLOWED_FIELDS.has(key)) sanitized[key] = req.body[key];
      }

      if (!sanitized.order_id) return res.status(400).json({ error: 'order_id الزامی است' });

      // changed_by ممکن است UUID باشد — null کن اگر integer نیست
      if (sanitized.changed_by && isNaN(Number(sanitized.changed_by))) {
        delete sanitized.changed_by;
      }

      const { data, error } = await supabase
        .from('crm_order_status_log')
        .insert(sanitized)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

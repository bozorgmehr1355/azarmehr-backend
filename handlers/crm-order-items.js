const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');
const ALLOWED_FIELDS = new Set(['order_id', 'product_id', 'product_name', 'qty', 'unit_price', 'total']);

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  try {
    requireAuth(req);

    // GET: اقلام — اگر order_id داده شد فقط آن سفارش، وگرنه همه (برای گزارش)
    if (req.method === 'GET') {
      const { order_id, limit } = req.query;
      const effectiveLimit = limit === 'all' ? 100000 : Number(limit || 100000);

      let query = supabase
        .from('crm_order_items')
        .select('*')
        .order('id', { ascending: true })
        .limit(effectiveLimit);

      if (order_id) query = query.eq('order_id', parseInt(String(order_id).replace(/^eq\./, '')));

      const { data, error } = await query;

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST: ثبت آیتم جدید — فقط admin+
    if (req.method === 'POST') {
      requireAdmin(req);

      const sanitized = {};
      for (const key of Object.keys(req.body || {})) {
        if (ALLOWED_FIELDS.has(key)) sanitized[key] = req.body[key];
      }

      if (!sanitized.order_id) return res.status(400).json({ error: 'order_id الزامی است' });

      const { data, error } = await supabase
        .from('crm_order_items')
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

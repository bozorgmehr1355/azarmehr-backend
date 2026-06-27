const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: لیست فاکتورها ───
    if (req.method === 'GET') {
      let query = supabase.from('crm_invoices').select('*');

      // order_id=eq.X
      if (req.query.order_id) {
        const m = req.query.order_id.match(/^eq\.(\d+)$/);
        if (m) query = query.eq('order_id', m[1]);
      }

      // invoice_type=eq.X
      if (req.query.invoice_type) {
        const m = req.query.invoice_type.match(/^eq\.(.+)$/);
        if (m) query = query.eq('invoice_type', m[1]);
      }

      // sent_at=is.null
      if (req.query.sent_at === 'is.null') {
        query = query.is('sent_at', null);
      }

      // order=field.asc / field.desc
      if (req.query.order) {
        const parts = req.query.order.split('.');
        if (parts.length === 2) {
          query = query.order(parts[0], { ascending: parts[1] === 'asc' });
        }
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // limit
      if (req.query.limit) {
        query = query.limit(Number(req.query.limit));
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'invoices_not_found', message: 'جدول فاکتورها وجود ندارد' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json(data || []);
    }

    // ─── PATCH: ویرایش فاکتور ───
    if (req.method === 'PATCH') {
      requireAdmin(req);
      const match = req.query.id && req.query.id.match(/^eq\.(\d+)$/);
      if (!match) return res.status(400).json({ error: 'id=eq.X در query الزامی است' });

      const allowed = ['sent_at', 'invoice_type', 'total', 'notes', 'status'];
      const updates = {};
      for (const [k, v] of Object.entries(req.body || {})) {
        if (allowed.includes(k)) updates[k] = v;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'هیچ فیلد مجازی برای آپدیت ارسال نشده' });
      }

      const { data, error } = await supabase
        .from('crm_invoices')
        .update(updates)
        .eq('id', match[1])
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'فاکتور پیدا نشد' });
      return res.json(data);
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

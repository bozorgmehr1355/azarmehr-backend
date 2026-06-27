const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = requireAuth(req);

    // ─── GET ───
    if (req.method === 'GET') {
      let query = supabase.from('crm_payments').select('*');

      // enforce customer_id from JWT for portal customers
      if (user.type === 'customer') {
        query = query.eq('customer_id', user.id);
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'table_not_found', message: 'جدول crm_payments وجود ندارد' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json(data || []);
    }

    // ─── POST ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const payload = { ...req.body, created_at: req.body?.created_at || new Date().toISOString() };
      const { data, error } = await supabase
        .from('crm_payments')
        .insert(payload)
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

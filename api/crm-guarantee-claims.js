const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: لیست ادعاهای گارانتی ───
    if (req.method === 'GET') {
      let query = supabase.from('crm_guarantee_claims').select('*');

      if (req.query.order) {
        const parts = req.query.order.split('.');
        if (parts.length === 2) {
          query = query.order(parts[0], { ascending: parts[1] === 'asc' });
        }
      } else {
        query = query.order('created_at', { ascending: false });
      }

      if (req.query.limit) {
        query = query.limit(Number(req.query.limit));
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'guarantee_not_found', message: 'جدول گارانتی وجود ندارد' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json(data || []);
    }

    // ─── POST: ایجاد ادعای گارانتی ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const payload = { ...req.body, created_at: req.body?.created_at || new Date().toISOString() };
      const { data, error } = await supabase
        .from('crm_guarantee_claims')
        .insert(payload)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ─── PATCH: بروزرسانی وضعیت ───
    if (req.method === 'PATCH') {
      requireAdmin(req);
      const match = req.query.id && req.query.id.match(/^eq\.(\d+)$/);
      if (!match) return res.status(400).json({ error: 'id=eq.X در query الزامی است' });

      const { data, error } = await supabase
        .from('crm_guarantee_claims')
        .update(req.body || {})
        .eq('id', match[1])
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'رکورد پیدا نشد' });
      return res.json(data);
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

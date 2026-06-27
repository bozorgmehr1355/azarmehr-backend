const { supabase, cors, requireAuth } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET ───
    if (req.method === 'GET') {
      let query = supabase.from('scorpion_customers').select('*');

      if (req.query.order) {
        const parts = req.query.order.split('.');
        if (parts.length === 2) {
          query = query.order(parts[0], { ascending: parts[1] === 'asc' });
        }
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'table_not_found', message: 'جدول scorpion_customers وجود ندارد' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json(data || []);
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

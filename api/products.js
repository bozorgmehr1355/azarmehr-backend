const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: لیست محصولات ───
    if (req.method === 'GET') {
      let query = supabase.from('products').select('*');

      // پشتیبانی از id=eq.X (PostgREST-style)
      if (req.query.id) {
        const match = req.query.id.match(/^eq\.(\d+)$/);
        if (match) query = query.eq('id', match[1]);
      }

      // پشتیبانی از order=name.asc / order=name.desc
      if (req.query.order) {
        const parts = req.query.order.split('.');
        if (parts.length === 2) {
          query = query.order(parts[0], { ascending: parts[1] === 'asc' });
        }
      } else {
        query = query.order('name', { ascending: true });
      }

      const { data, error } = await query;
      if (error) {
        // اگر جدول وجود نداشت، پیام بده
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'products_not_found', message: 'جدول محصولات وجود ندارد. لطفاً ابتدا setup را اجرا کنید.' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json(data || []);
    }

    // ─── POST: ایجاد محصول ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const { name, base_price, stock, description, has_guarantee, guarantee_days, created_at } = req.body || {};
      if (!name) return res.status(400).json({ error: 'نام محصول الزامی است' });

      const { data, error } = await supabase
        .from('products')
        .insert({
          name,
          base_price: Number(base_price) || 0,
          stock: Number(stock) || 0,
          description: description || '',
          has_guarantee: !!has_guarantee,
          guarantee_days: Number(guarantee_days) || 0,
          created_at: created_at || new Date().toISOString()
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ─── PATCH: ویرایش محصول (id در query) ───
    if (req.method === 'PATCH') {
      requireAdmin(req);
      const match = req.query.id && req.query.id.match(/^eq\.(\d+)$/);
      if (!match) return res.status(400).json({ error: 'id=eq.X در query الزامی است' });

      const id = match[1];
      const allowed = ['name', 'base_price', 'stock', 'description', 'has_guarantee', 'guarantee_days'];
      const updates = {};
      for (const [k, v] of Object.entries(req.body || {})) {
        if (allowed.includes(k)) updates[k] = v;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'هیچ فیلد مجازی برای آپدیت ارسال نشده' });
      }

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'محصول پیدا نشد' });
      return res.json(data);
    }

    // ─── DELETE: حذف محصول (id در query) ───
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const match = req.query.id && req.query.id.match(/^eq\.(\d+)$/);
      if (!match) return res.status(400).json({ error: 'id=eq.X در query الزامی است' });

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', match[1]);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

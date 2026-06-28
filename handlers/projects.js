const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: لیست پروژه‌ها ───
    if (req.method === 'GET') {
      let query = supabase
        .from('projects')
        .select('*');

      // پشتیبانی از id=eq.X (عدد یا UUID)
      if (req.query.id) {
        const val = req.query.id.replace(/^eq\./, '');
        if (val) query = query.eq('id', val);
      }

      // فیلتر بر اساس status
      if (req.query.status) {
        const val = String(req.query.status).replace(/^eq\./, '');
        query = query.eq('status', val);
      }

      // فیلتر بر اساس order_id
      if (req.query.order_id) {
        const val = String(req.query.order_id).replace(/^eq\./, '');
        query = query.eq('order_id', val);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ─── POST: ایجاد پروژه (دستی توسط ادمین) ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const me = requireAuth(req);
      const { order_id, title, description, manager_id } = req.body || {};

      if (!title) return res.status(400).json({ error: 'عنوان پروژه الزامی است' });

      const { data, error } = await supabase
        .from('projects')
        .insert({
          order_id: order_id || null,
          title,
          description: description || '',
          manager_id: manager_id || me.id,
          status: 'active'
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // اگر order_id دارد، مدیر سفارش را به عنوان عضو اضافه کن
      if (order_id && manager_id) {
        try {
          await supabase
            .from('project_members')
            .insert({ project_id: data.id, user_id: manager_id, role: 'manager' });
        } catch (_) {} // ignore duplicate
      }

      return res.status(201).json(data);
    }

    // ─── PUT: ویرایش پروژه ───
    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const allowed = ['title', 'description', 'status', 'manager_id'];
      const payload = {};
      for (const [k, v] of Object.entries(rest)) {
        if (allowed.includes(k)) payload[k] = v;
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'هیچ فیلدی برای آپدیت ارسال نشده' });
      }

      const { data, error } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'پروژه پیدا نشد' });
      return res.json(data);
    }

    // ─── DELETE: حذف پروژه ───
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

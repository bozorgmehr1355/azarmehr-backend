const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: لیست وظایف ───
    if (req.method === 'GET') {
      let query = supabase.from('project_tasks').select('*');

      // فیلتر بر اساس project_id
      if (req.query.project_id) {
        const val = String(req.query.project_id).replace(/^eq\./, '');
        query = query.eq('project_id', val);
      }

      // فیلتر بر اساس assigned_to
      if (req.query.assigned_to) {
        const val = String(req.query.assigned_to).replace(/^eq\./, '');
        query = query.eq('assigned_to', val);
      }

      // فیلتر بر اساس status
      if (req.query.status) {
        const val = String(req.query.status).replace(/^eq\./, '');
        query = query.eq('status', val);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ─── POST: ایجاد وظیفه ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const { project_id, title, description, assigned_to, priority, due_date } = req.body || {};

      if (!project_id) return res.status(400).json({ error: 'project_id الزامی است' });
      if (!title) return res.status(400).json({ error: 'عنوان وظیفه الزامی است' });

      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          project_id,
          title,
          description: description || '',
          assigned_to: assigned_to || null,
          priority: priority || 'medium',
          due_date: due_date || null,
          status: 'pending'
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ─── PUT: ویرایش وظیفه ───
    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const allowed = ['title', 'description', 'assigned_to', 'status', 'priority', 'due_date'];
      const payload = {};
      for (const [k, v] of Object.entries(rest)) {
        if (allowed.includes(k)) payload[k] = v;
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'هیچ فیلدی برای آپدیت ارسال نشده' });
      }

      const { data, error } = await supabase
        .from('project_tasks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'وظیفه پیدا نشد' });
      return res.json(data);
    }

    // ─── DELETE: حذف وظیفه ───
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const { error } = await supabase
        .from('project_tasks')
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

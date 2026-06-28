const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: لیست اعضای پروژه ───
    if (req.method === 'GET') {
      let query = supabase.from('project_members').select('*');

      // فیلتر بر اساس project_id
      if (req.query.project_id) {
        query = query.eq('project_id', req.query.project_id);
      }

      // فیلتر بر اساس user_id
      if (req.query.user_id) {
        query = query.eq('user_id', req.query.user_id);
      }

      query = query.order('created_at', { ascending: true });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ─── POST: افزودن عضو ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const { project_id, user_id, role } = req.body || {};

      if (!project_id) return res.status(400).json({ error: 'project_id الزامی است' });
      if (!user_id) return res.status(400).json({ error: 'user_id الزامی است' });

      const { data, error } = await supabase
        .from('project_members')
        .insert({
          project_id,
          user_id,
          role: role || 'member'
        })
        .select()
        .single();

      if (error) {
        if (error.message?.includes('duplicate')) {
          return res.status(409).json({ error: 'این کاربر قبلاً به پروژه اضافه شده است' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    }

    // ─── DELETE: حذف عضو ───
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const { error } = await supabase
        .from('project_members')
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

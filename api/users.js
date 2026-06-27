const { cors, bcrypt, supabase, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Parse sub-path:  /api/users              → parts = ['api','users']
    //                   /api/users/reset-password  → parts = ['api','users','reset-password']
    //                   /api/users/123/reset-password → parts = ['api','users','123','reset-password']
    const pathname = (req.url || '').split('?')[0].replace(/\/+$/, '');
    const parts = pathname.split('/').filter(Boolean);
    const resetIdx = parts.findIndex(p => p === 'reset-password');
    const subAction = resetIdx !== -1 ? 'reset-password' : (parts.length > 2 ? parts[2] : null);
    const targetId = (resetIdx > 2 && parts.length >= resetIdx + 1)
      ? parts[resetIdx - 1]
      : null;

    // ─── POST /api/users/reset-password (self reset) ───
    if (subAction === 'reset-password' && !targetId && req.method === 'POST') {
      const user = requireAuth(req);
      const { currentPassword, newPassword } = req.body || {};

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword و newPassword الزامی است' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'رمز عبور جدید حداقل ۶ کاراکتر باید باشد' });
      }

      const { data: dbUser, error: fetchError } = await supabase
        .from('users')
        .select('password')
        .eq('id', user.id)
        .single();

      if (fetchError || !dbUser) {
        return res.status(404).json({ error: 'کاربر یافت نشد' });
      }

      if (!bcrypt.compareSync(currentPassword, dbUser.password)) {
        return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است' });
      }

      const hashed = bcrypt.hashSync(newPassword, 10);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashed })
        .eq('id', user.id);

      if (updateError) throw updateError;
      return res.json({ message: 'رمز عبور با موفقیت تغییر کرد' });
    }

    // ─── POST /api/users/:id/reset-password (admin force reset) ───
    if (targetId && subAction === 'reset-password' && req.method === 'POST') {
      requireAdmin(req);
      const { newPassword } = req.body || {};

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'newPassword باید حداقل ۶ کاراکتر باشد' });
      }

      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', targetId)
        .single();

      if (!dbUser) {
        return res.status(404).json({ error: 'کاربر یافت نشد' });
      }

      const hashed = bcrypt.hashSync(newPassword, 10);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashed })
        .eq('id', targetId);

      if (updateError) throw updateError;
      return res.json({ message: 'رمز عبور کاربر با موفقیت بازنشانی شد' });
    }

    // ─── GET /api/users ───
    if (req.method === 'GET') {
      requireAuth(req);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, username, role, system_role, avatar, created_at, updated_at')
        .order('id');
      if (usersError) throw usersError;

      let orgChart = [];
      try {
        const { data: ocData } = await supabase.from('org_chart').select('*');
        if (ocData) orgChart = ocData;
      } catch {
        // جدول org_chart ممکن است وجود نداشته باشد
      }

      return res.json({ users: users || [], orgChart });
    }

    // ─── POST /api/users (ایجاد کاربر جدید) ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const user = { ...req.body };

      if (user.password) {
        user.password = bcrypt.hashSync(user.password, 10);
      }

      const { data, error } = await supabase
        .from('users')
        .insert([user])
        .select('id, full_name, username, role, system_role, avatar, created_at, updated_at')
        .single();
      if (error) throw error;
      return res.json(data);
    }

    // ─── PUT /api/users (ویرایش کاربر) ───
    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, ...updates } = req.body;

      if (updates.password) {
        if (updates.password === '') {
          delete updates.password;
        } else {
          updates.password = bcrypt.hashSync(updates.password, 10);
        }
      }

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', id)
        .select('id, full_name, username, role, system_role, avatar, created_at, updated_at')
        .single();
      if (error) throw error;
      return res.json(data);
    }

    // ─── DELETE /api/users ───
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body;
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'روش مجاز نیست' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

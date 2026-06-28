const { cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib'); // ✅ اضافه شد: requireSuperAdmin

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      requireAuth(req);
      const { data, error } = await require('./_lib').supabase
        .from('crm_payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json(data || []);
    }

    if (req.method === 'POST') {
      requireAdmin(req);
      const payment = req.body;
      const { data, error } = await require('./_lib').supabase
        .from('crm_payments')
        .insert([payment])
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, ...updates } = req.body;
      const { data, error } = await require('./_lib').supabase
        .from('crm_payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      requireSuperAdmin(req); // ✅ حالا کار می‌کند
      const { id } = req.body;
      const { error } = await require('./_lib').supabase
        .from('crm_payments')
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

const { supabase, cors, requireAuth } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const me = requireAuth(req);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', me.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return res.json(data || []);
    }

    if (req.method === 'PATCH') {
      console.log('PATCH body:', req.body, typeof req.body);
      const { id, read } = req.body;
      const { error } = await supabase
        .from('notifications')
        .update({ read })
        .eq('id', id)
        .eq('user_id', me.id);
      if (error) throw error;
      return res.json({ success: true });
    }
    res.status(405).end();
  } catch(e) {
    res.status(500).json({error:e.message});
  }
};

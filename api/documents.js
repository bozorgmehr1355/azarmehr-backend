const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const currentUser = requireAuth(req);

    // GET: دریافت اسناد یک سفارش
    if (req.method === 'GET') {
      const { order_id } = req.query;
      if (!order_id) return res.status(400).json({ error: 'order_id الزامی است' });

      const { data, error } = await supabase
        .from('order_documents')
        .select('id, order_id, customer_id, file_name, file_type, file_size, mime_type, status, admin_note, uploaded_by, reviewed_by, reviewed_at, created_at, updated_at')
        .eq('order_id', parseInt(String(order_id).replace(/^eq\./, '')))
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST: آپلود سند جدید
    if (req.method === 'POST') {
      const { order_id, customer_id, file_name, file_type, file_data, file_size, mime_type } = req.body;
      if (!order_id || !customer_id || !file_name || !file_type || !file_data) {
        return res.status(400).json({ error: 'فیلدهای order_id، customer_id، file_name، file_type و file_data الزامی هستند' });
      }

      const { data, error } = await supabase
        .from('order_documents')
        .insert({
          order_id: parseInt(String(order_id).replace(/^eq\./, '')),
          customer_id: parseInt(String(customer_id).replace(/^eq\./, '')),
          file_name,
          file_type,
          file_data,
          file_size: file_size || null,
          mime_type: mime_type || null,
          uploaded_by: currentUser.id
        })
        .select('id, order_id, customer_id, file_name, file_type, file_size, mime_type, status, created_at')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // PUT: تغییر وضعیت سند (فقط admin)
    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, status, admin_note } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'id و status الزامی هستند' });
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'status باید approved، rejected یا pending باشد' });
      }

      const { data, error } = await supabase
        .from('order_documents')
        .update({
          status,
          admin_note: admin_note || null,
          reviewed_by: currentUser.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, order_id, status, admin_note, reviewed_by, reviewed_at')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'سند پیدا نشد' });
      return res.json(data);
    }

    // DELETE: حذف سند (فقط admin)
    if (req.method === 'DELETE') {
      requireAdmin(req);
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const { error } = await supabase
        .from('order_documents')
        .delete()
        .eq('id', id);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

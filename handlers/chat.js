const { supabase, cors, requireAuth } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const currentUser = requireAuth(req);

    // GET: دریافت پیام‌های چت یک سفارش
    if (req.method === 'GET') {
      const { order_id } = req.query;
      if (!order_id) return res.status(400).json({ error: 'order_id الزامی است' });

      const { data, error } = await supabase
        .from('order_chat')
        .select('id, order_id, sender_id, sender_type, sender_name, message, is_read, created_at')
        .eq('order_id', parseInt(String(order_id).replace(/^eq\./, '')))
        .order('created_at', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST: ارسال پیام جدید
    if (req.method === 'POST') {
      const { order_id, sender_id, sender_type, sender_name, message } = req.body;
      if (!order_id || !sender_id || !sender_type || !sender_name || !message) {
        return res.status(400).json({ error: 'همه فیلدها الزامی هستند' });
      }
      if (!['customer', 'admin'].includes(sender_type)) {
        return res.status(400).json({ error: 'sender_type باید customer یا admin باشد' });
      }

      const { data, error } = await supabase
        .from('order_chat')
        .insert({
          order_id: parseInt(String(order_id).replace(/^eq\./, '')),
          sender_id,
          sender_type,
          sender_name,
          message
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // PUT: علامت‌گذاری پیام‌ها به عنوان خوانده‌شده
    if (req.method === 'PUT') {
      const { order_id, sender_type } = req.body;
      if (!order_id) return res.status(400).json({ error: 'order_id الزامی است' });

      const opposite = sender_type === 'admin' ? 'customer' : 'admin';

      const { error } = await supabase
        .from('order_chat')
        .update({ is_read: true })
        .eq('order_id', parseInt(String(order_id).replace(/^eq\./, '')))
        .eq('sender_type', opposite)
        .eq('is_read', false);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

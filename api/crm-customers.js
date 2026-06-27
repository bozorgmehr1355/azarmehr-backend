const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

// فیلدهایی که نباید از client مستقیم نوشته شوند
const BLOCKED = new Set(['id', 'created_at', 'deleted_at', 'approved_by', 'user_id']);

const VALID_GRADES = new Set(['standard', 'silver', 'gold', 'vip']);
const VALID_SEGMENTS = new Set(['A', 'B', 'C']);
const VALID_CHANNELS = new Set(['website', 'phone', 'direct', 'referral']);
function validateGrade(payload, res) {
  if (payload.grade !== undefined && !VALID_GRADES.has(payload.grade)) {
    res.status(400).json({ error: 'Invalid grade. Allowed values: standard, silver, gold, vip' });
    return false;
  }
  return true;
}

function sanitize(body) {
  const payload = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (!BLOCKED.has(k)) payload[k] = v;
  }
  // هم‌راستاسازی type ↔ customer_kind برای سازگاری عقب‌رو
  if (!payload.customer_kind && payload.type) {
    payload.customer_kind = payload.type;
  }
  if (!payload.type && payload.customer_kind) {
    payload.type = payload.customer_kind;
  }
  // حذف sales_segment/source_channel نامعتبر
  if (payload.sales_segment !== undefined && !VALID_SEGMENTS.has(payload.sales_segment)) {
    delete payload.sales_segment;
  }
  if (payload.source_channel !== undefined && !VALID_CHANNELS.has(payload.source_channel)) {
    delete payload.source_channel;
  }
  return payload;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // GET: لیست مشتریان
    if (req.method === 'GET') {
      const { id, search, limit = 500, offset = 0 } = req.query;

      let query = supabase.from('crm_customers').select('*');

      if (id) query = query.eq('id', id);
      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,store_name.ilike.%${search}%`);
      }

      query = query.order('created_at', { ascending: false })
                   .range(Number(offset), Number(offset) + Number(limit) - 1);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST: ایجاد مشتری — فقط admin+
    if (req.method === 'POST') {
      requireAdmin(req);
      const payload = sanitize(req.body);

      if (!payload.name) return res.status(400).json({ error: 'نام مشتری الزامی است' });
      if (!validateGrade(payload, res)) return;

      // type پیش‌فرض اگر نیامد
      if (!payload.type) payload.type = 'B2B';

      const { data, error } = await supabase
        .from('crm_customers')
        .insert(payload)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // PUT: ویرایش مشتری — فقط admin+
    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const payload = sanitize(rest);
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'هیچ فیلدی برای آپدیت ارسال نشده' });
      }
      if (!validateGrade(payload, res)) return;

      const { data, error } = await supabase
        .from('crm_customers')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'مشتری پیدا نشد' });
      return res.json(data);
    }

    // DELETE: حذف مشتری — فقط super_admin
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const { error } = await supabase
        .from('crm_customers')
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

const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: دریافت چارت سازمانی ───
    if (req.method === 'GET') {
      let query = supabase
        .from('org_chart')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      // اگر id مشخص شده باشد، فقط آن گره را برگردان
      if (req.query.id) {
        query = query.eq('id', req.query.id);
      }

      // اگر department مشخص شده باشد، فیلتر کند
      if (req.query.department) {
        query = query.eq('department', req.query.department);
      }

      const { data, error } = await query;
      if (error) {
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'جدول چارت سازمانی وجود ندارد. لطفاً اسکریپت schema-settings.sql را اجرا کنید.' });
        }
        return res.status(500).json({ error: error.message });
      }

      // ساخت درخت از داده‌های تخت
      const tree = buildTree(data || []);
      return res.json({ flat: data || [], tree });
    }

    // ─── POST: افزودن گره جدید ───
    if (req.method === 'POST') {
      requireAdmin(req);
      const { parent_id, title, department, user_id, sort_order } = req.body || {};

      if (!title) return res.status(400).json({ error: 'عنوان سمت الزامی است' });

      const { data, error } = await supabase
        .from('org_chart')
        .insert({
          parent_id: parent_id || null,
          title,
          department: department || '',
          user_id: user_id || null,
          sort_order: sort_order || 0,
          is_active: true
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ─── PUT: ویرایش گره ───
    if (req.method === 'PUT') {
      requireAdmin(req);
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const allowed = ['parent_id', 'title', 'department', 'user_id', 'sort_order', 'is_active'];
      const payload = {};
      for (const [k, v] of Object.entries(rest)) {
        if (allowed.includes(k)) payload[k] = v;
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'هیچ فیلدی برای آپدیت ارسال نشده' });
      }

      const { data, error } = await supabase
        .from('org_chart')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'گره پیدا نشد' });
      return res.json(data);
    }

    // ─── DELETE: حذف گره (به همراه زیرمجموعه‌ها) ───
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      // غیرفعال کردن به جای حذف فیزیکی
      const { error } = await supabase
        .from('org_chart')
        .update({ is_active: false })
        .eq('id', id);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, message: 'گره غیرفعال شد' });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

// ─── تابع کمکی: تبدیل لیست تخت به درخت ───
function buildTree(items, parentId = null) {
  return items
    .filter(item => item.parent_id === parentId)
    .map(item => ({
      ...item,
      children: buildTree(items, item.id)
    }));
}

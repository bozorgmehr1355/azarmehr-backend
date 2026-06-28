const { supabase, cors, requireAuth, requireAdmin } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAuth(req);

    // ─── GET: دریافت تنظیمات ───
    if (req.method === 'GET') {
      let query = supabase.from('app_settings').select('*');

      // فیلتر بر اساس بخش (section)
      if (req.query.section) {
        query = query.eq('section', req.query.section);
      }

      // فیلتر بر اساس کلید (key)
      if (req.query.key) {
        query = query.eq('key', req.query.key);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) {
        // اگر جدول وجود ندارد، خطا را برگردان
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return res.status(404).json({ error: 'جدول تنظیمات وجود ندارد. لطفاً اسکریپت schema-settings.sql را اجرا کنید.' });
        }
        return res.status(500).json({ error: error.message });
      }

      // اگر key مشخص شده باشد، فقط همان یک رکورد را برگردان
      if (req.query.key && data && data.length === 1) {
        return res.json(data[0]);
      }

      return res.json(data || []);
    }

    // ─── PUT: ذخیره تنظیمات (یک یا چندتا) ───
    if (req.method === 'PUT') {
      requireAdmin(req);
      const body = req.body || {};

      // پشتیبانی از دو فرمت:
      // 1. { section: 'x', key: 'y', value: 'z' }  ← یک تنظیم
      // 2. { settings: [{ section, key, value }, ...] }  ← چند تنظیم یکجا

      const settings = body.settings || [body];

      const results = [];

      for (const item of settings) {
        if (!item.section || !item.key) continue;

        const { data, error } = await supabase
          .from('app_settings')
          .upsert({
            section: item.section,
            key: item.key,
            value: item.value,
            label: item.label || undefined,
            description: item.description || undefined,
            type: item.type || undefined,
            options: item.options || undefined
          }, { onConflict: 'section,key' })
          .select()
          .single();

        if (error) {
          results.push({ section: item.section, key: item.key, error: error.message });
        } else {
          results.push({ section: data.section, key: data.key, value: data.value, ok: true });
        }
      }

      return res.json({ ok: true, results });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

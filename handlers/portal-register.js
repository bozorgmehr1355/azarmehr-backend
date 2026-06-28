const { supabase, cors } = require('./_lib');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      username,  // suggested username (optional)
      name,
      company_name,
      legal_type,
      national_id,
      company_national_id,
      economic_code,
      ceo_name,
      phone,
      email,
      city,
      address,
    } = req.body || {};

    // ── Validation ──────────────────────────────────────────────
    const type = legal_type === 'legal' ? 'legal' : 'individual';

    if (type === 'legal') {
      if (!company_name) {
        return res.status(400).json({ error: 'نام شرکت الزامی است' });
      }
    } else {
      if (!name) {
        return res.status(400).json({ error: 'نام و نام خانوادگی الزامی است' });
      }
    }

    // ── Check duplicate suggested username ──────────────────────
    if (username) {
      const { data: existing } = await supabase
        .from('crm_customers')
        .select('id')
        .eq('portal_username', username)
        .single();
      if (existing) {
        return res.status(409).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
      }
    }

    // ── Build pending customer record ──────────────────────────
    const payload = {
      name: type === 'legal' ? (company_name || name) : name,
      company_name: type === 'legal' ? company_name : null,
      legal_type: type,
      customer_kind: type === 'legal' ? 'B2B' : 'B2C',
      type: type === 'legal' ? 'B2B' : 'B2C',
      customer_status: 'new',
      portal_active: false,
      phone: phone || null,
      email: email || null,
      city: city || null,
      address: address || null,
      national_id: type === 'individual' ? (national_id || null) : null,
      company_national_id: type === 'legal' ? (company_national_id || null) : null,
      economic_code: type === 'legal' ? (economic_code || null) : null,
      ceo_name: type === 'legal' ? (ceo_name || null) : null,
      portal_username: username || null,
      portal_password: null,
      grade: 'standard',
    };

    const { data: customer, error } = await supabase
      .from('crm_customers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'خطا در ثبت درخواست: ' + error.message });
    }

    // ── NO auto-login — just success message ──────────────────
    return res.status(201).json({
      success: true,
      message: 'درخواست شما با موفقیت ثبت شد. پس از تأیید مدیر، نام کاربری و رمز عبور برای شما صادر خواهد شد.',
    });

  } catch (e) {
    return res.status(500).json({ error: 'Internal server error', details: e.message });
  }
};

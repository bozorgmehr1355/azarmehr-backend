const { supabase, cors, requireAdmin } = require("./_lib");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "متد مجاز نیست" });
  }

  try {
    // ── Auth: فقط admin/super_admin مجاز است ───────────────────────────────
    requireAdmin(req);

    // ── Fetch pending payments با join روی crm_customers ──────────────────
    const { data: payments, error } = await supabase
      .from("crm_payments")
      .select(`
        id,
        customer_id,
        amount,
        note,
        payment_date,
        created_at,
        status,
        crm_customers ( id, name, phone )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message || "خطا در دریافت پرداخت‌ها" });
    }

    // ── Flatten customer info ───────────────────────────────────────────────
    const result = (payments || []).map((p) => ({
      id:            p.id,
      customer_id:   p.customer_id,
      customer_name: p.crm_customers?.name || null,
      customer_phone:p.crm_customers?.phone || null,
      amount:        p.amount,
      note:          p.note,
      payment_date:  p.payment_date,
      created_at:    p.created_at,
      status:        p.status,
    }));

    return res.status(200).json({ ok: true, payments: result });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "خطای سرور" });
  }
};

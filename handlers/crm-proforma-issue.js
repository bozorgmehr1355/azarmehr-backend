const { supabase, cors, requireAdmin } = require("./_lib");
const ALLOWED_FIELDS = new Set(["order_id"]);

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "متد مجاز نیست" });
  }

  try {
    // ── Auth: فقط admin یا super_admin ──────────────────────────────────────
    requireAdmin(req);

    // ── Validate body ───────────────────────────────────────────────────────
    const sanitized = {};
    for (const key of Object.keys(req.body || {})) {
      if (ALLOWED_FIELDS.has(key)) sanitized[key] = req.body[key];
    }
    const raw_order_id = sanitized.order_id;
    const order_id = Number(raw_order_id);
    if (!raw_order_id || !Number.isFinite(order_id) || order_id <= 0) {
      return res.status(400).json({ error: "order_id معتبر نیست" });
    }

    // ── Fetch order ─────────────────────────────────────────────────────────
    const { data: order, error: fetchError } = await supabase
      .from("crm_orders")
      .select("id, customer_id, proforma_status")
      .eq("id", order_id)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: "سفارش پیدا نشد" });
    }

    // ── Status rules ────────────────────────────────────────────────────────
    if (order.proforma_status === "approved") {
      return res.status(409).json({
        error: "پیش‌فاکتور قبلاً توسط مشتری تایید شده و قابل تغییر نیست",
        current_status: order.proforma_status
      });
    }

    if (order.proforma_status === "issued") {
      return res.status(200).json({
        ok: true,
        order_id,
        already_issued: true,
        proforma_status: "issued"
      });
    }

    // ── Update: draft/null → issued ─────────────────────────────────────────
    const now = new Date().toISOString();

    const { data: updatedOrder, error: updateError } = await supabase
      .from("crm_orders")
      .update({
        proforma_status: "issued",
        proforma_issued_at: now
      })
      .eq("id", order_id)
      .in("proforma_status", ["draft", null])
      .select("id, proforma_status, proforma_issued_at")
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || "خطا در بروزرسانی سفارش" });
    }

    if (!updatedOrder) {
      return res.status(409).json({ error: "وضعیت پیش‌فاکتور در این لحظه تغییر کرده است" });
    }

    // ── Response موفق ───────────────────────────────────────────────────────
    return res.status(200).json({
      ok: true,
      order_id,
      proforma_status: updatedOrder.proforma_status,
      proforma_issued_at: updatedOrder.proforma_issued_at
    });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "خطای سرور" });
  }
};

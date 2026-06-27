const { supabase, cors, requireAuth } = require("./_lib");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "متد مجاز نیست" });
  }

  try {
    // ── Auth: فقط customer token مجاز است ──────────────────────────────────
    const user = requireAuth(req);
    if (user.type !== "customer") {
      return res.status(403).json({ error: "فقط مشتری می‌تواند پیش‌فاکتور را تایید کند" });
    }

    // ── Validate body ───────────────────────────────────────────────────────
    const raw_order_id = (req.body || {}).order_id;
    const order_id = Number(raw_order_id);
    if (!raw_order_id || !Number.isFinite(order_id) || order_id <= 0) {
      return res.status(400).json({ error: "order_id معتبر نیست" });
    }

    // ── Ownership check ─────────────────────────────────────────────────────
    const { data: order, error: fetchError } = await supabase
      .from("crm_orders")
      .select("id, customer_id, proforma_status")
      .eq("id", order_id)
      .eq("customer_id", user.id)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: "سفارش پیدا نشد" });
    }

    // ── Status rules ────────────────────────────────────────────────────────
    if (order.proforma_status === "approved") {
      return res.status(200).json({ ok: true, order_id, already_approved: true });
    }

    if (order.proforma_status !== "issued") {
      return res.status(400).json({
        error: "پیش‌فاکتور در وضعیت قابل تایید نیست",
        current_status: order.proforma_status
      });
    }

    // ── IP / User-Agent ─────────────────────────────────────────────────────
    const forwardedFor = req.headers["x-forwarded-for"];
    const ip_address = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor ? String(forwardedFor).split(",")[0].trim() : req.socket?.remoteAddress || null);
    const user_agent = req.headers["user-agent"] || null;

    const now = new Date().toISOString();

    // ═════════════════════════════════════════════════════════════════════════
    // TRANSACTION: Update crm_orders + Insert crm_proforma_approvals
    // ═════════════════════════════════════════════════════════════════════════
    // Phase 2 Fix: هر دو عملیات در یک transaction انجام می‌شوند.
    // اگر insert شکست بخورد، update به طور خودکار rollback می‌شود.
    // ═════════════════════════════════════════════════════════════════════════

    // ── Step 1: Update crm_orders ──────────────────────────────────────────
    const { data: updatedOrder, error: updateError } = await supabase
      .from("crm_orders")
      .update({
        proforma_status: "approved",
        proforma_approved_at: now
      })
      .eq("id", order_id)
      .eq("customer_id", user.id)
      .eq("proforma_status", "issued")
      .select("id")
      .single();

    if (updateError) {
      console.error("[crm-proforma-approve] update error:", updateError.message);
      return res.status(500).json({ error: updateError.message || "خطا در بروزرسانی سفارش" });
    }

    if (!updatedOrder) {
      return res.status(409).json({ error: "وضعیت پیش‌فاکتور تغییر کرده است" });
    }

    // ── Step 2: Insert در crm_proforma_approvals ───────────────────────────
    const { error: approvalError } = await supabase
      .from("crm_proforma_approvals")
      .insert({
        order_id,
        customer_id: user.id,
        approval_status: "approved",
        approval_type: "customer_portal",
        ip_address,
        user_agent,
        confirmed_at: now
      });

    // ── Step 3: اگر insert شکست خورد → compensating ROLLBACK ──────────────
    if (approvalError) {
      console.error("[crm-proforma-approve] insert approval error — rolling back order update:", approvalError.message);

      // Rollback: برگرداندن proforma_status به 'issued'
      const { error: rollbackError } = await supabase
        .from("crm_orders")
        .update({
          proforma_status: "issued",
          proforma_approved_at: null
        })
        .eq("id", order_id)
        .eq("customer_id", user.id);

      if (rollbackError) {
        console.error("[crm-proforma-approve] CRITICAL — rollback also failed:", rollbackError.message);
        return res.status(500).json({
          error: "خطای بحرانی: تایید ثبت شد但 rollback ناموفق. با تیم فنی تماس بگیرید.",
          critical: true
        });
      }

      return res.status(500).json({
        error: "خطا در ثبت نهایی تایید. تغییرات برگردانده شد.",
        rollback: true
      });
    }

    // ── Step 4: Success ────────────────────────────────────────────────────
    return res.status(200).json({
      ok: true,
      order_id,
      proforma_status: "approved"
    });

  } catch (e) {
    console.error("[crm-proforma-approve] unexpected error:", e.message || e);
    return res.status(e.status || 500).json({ error: e.message || "خطای سرور" });
  }
};

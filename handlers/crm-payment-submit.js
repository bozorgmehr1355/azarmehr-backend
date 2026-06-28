const { supabase, cors, requireAuth } = require("./_lib");
const ALLOWED_FIELDS = new Set(["amount", "payment_method", "note", "order_id"]);

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "متد مجاز نیست" });
  }

  try {
    // ── Auth: فقط customer token مجاز است ──────────────────────────────────
    const user = requireAuth(req);
    if (user.type !== "customer") {
      return res.status(403).json({ error: "فقط مشتری می‌تواند پرداخت ثبت کند" });
    }

    // ── Strict whitelist از body ────────────────────────────────────────────
    const sanitized = {};
    for (const key of Object.keys(req.body || {})) {
      if (ALLOWED_FIELDS.has(key)) sanitized[key] = req.body[key];
    }
    const { amount, payment_method, note, order_id } = sanitized;

    // ── Validation ──────────────────────────────────────────────────────────
    const parsedAmount = Number(amount);
    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "مبلغ باید عدد مثبت باشد" });
    }

    if (!payment_method || typeof payment_method !== "string" || !payment_method.trim()) {
      return res.status(400).json({ error: "روش پرداخت الزامی است" });
    }

    if (note !== undefined && note !== null && typeof note !== "string") {
      return res.status(400).json({ error: "یادداشت باید متن باشد" });
    }

    let parsedOrderId = null;
    if (order_id !== undefined && order_id !== null && order_id !== "") {
      parsedOrderId = Number(order_id);
      if (!Number.isInteger(parsedOrderId) || parsedOrderId <= 0) {
        return res.status(400).json({ error: "order_id باید عدد صحیح مثبت باشد" });
      }

      // ── اعتبارسنجی مالکیت order ────────────────────────────────────────
      const { data: order, error: orderError } = await supabase
        .from("crm_orders")
        .select("id, customer_id")
        .eq("id", parsedOrderId)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ error: "سفارش یافت نشد" });
      }

      if (order.customer_id !== user.id) {
        return res.status(403).json({ error: "این سفارش متعلق به شما نیست" });
      }
    }

    // ── ساخت note نهایی (order_id در note جاسازی می‌شود) ──────────────────
    let finalNote = null;
    const parts = [];
    if (parsedOrderId)          parts.push(`سفارش #${parsedOrderId}`);
    parts.push(`روش پرداخت: ${payment_method.trim()}`);
    if (note && note.trim())    parts.push(note.trim());
    finalNote = parts.join(" - ");

    // ── Insert — بدون order_id (ستون جداگانه در دیتابیس وجود ندارد) ──────
    const now = new Date().toISOString();
    const payload = {
      customer_id:    user.id,
      amount:         parsedAmount,
      note:           finalNote,
      payment_date:   now,
      created_at:     now,
      status:         "pending",
    };
    if (payment_method) payload.payment_method = payment_method.trim();

    const { data: payment, error } = await supabase
      .from("crm_payments")
      .insert(payload)
      .select("id, customer_id, amount, status")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message || "خطا در ثبت پرداخت" });
    }

    // ── Response موفق ───────────────────────────────────────────────────────
    return res.status(200).json({
      ok: true,
      payment: {
        id:          payment.id,
        customer_id: payment.customer_id,
        amount:      payment.amount,
        status:      payment.status || "pending",
      },
    });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "خطای سرور" });
  }
};

const { supabase, cors, requireAdmin } = require("./_lib");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "متد مجاز نیست" });
  }

  try {
    // ── Auth: فقط admin/super_admin مجاز است ───────────────────────────────
    const admin = requireAdmin(req);

    // ── Validate body ───────────────────────────────────────────────────────
    const { payment_id, order_id, action = "verify", admin_notes } = req.body || {};

    // حداقل یکی از payment_id یا order_id باید موجود باشد
    if (!payment_id && !order_id) {
      return res.status(400).json({ error: "payment_id یا order_id الزامی است" });
    }

    // اعتبارسنجی action
    if (!["verify", "reject"].includes(action)) {
      return res.status(400).json({ error: "action باید verify یا reject باشد" });
    }

    // اعتبارسنجی admin_notes
    if (admin_notes !== undefined && admin_notes !== null && typeof admin_notes !== "string") {
      return res.status(400).json({ error: "admin_notes باید متن باشد" });
    }

    const now = new Date().toISOString();
    let targetPayments = [];

    // ── مرحله 1: یافتن پرداخت(های) هدف ──────────────────────────────────────
    if (payment_id) {
      // حالت تک‌پرداخت
      const parsedPaymentId = Number(payment_id);
      if (!Number.isFinite(parsedPaymentId) || parsedPaymentId <= 0) {
        return res.status(400).json({ error: "payment_id معتبر نیست" });
      }

      const { data: payment, error: payError } = await supabase
        .from("crm_payments")
        .select("id, order_id, amount, status")
        .eq("id", parsedPaymentId)
        .single();

      if (payError || !payment) {
        return res.status(404).json({ error: "پرداخت پیدا نشد" });
      }

      if (payment.status !== "pending") {
        return res.status(400).json({ 
          error: `پرداخت در وضعیت ${payment.status} است و قابل ${action === "verify" ? "تایید" : "رد"} نیست` 
        });
      }

      targetPayments = [payment];
    } else {
      // حالت همه پرداخت‌های pending یک سفارش
      const parsedOrderId = Number(order_id);
      if (!Number.isFinite(parsedOrderId) || parsedOrderId <= 0) {
        return res.status(400).json({ error: "order_id معتبر نیست" });
      }

      const { data: payments, error: payError } = await supabase
        .from("crm_payments")
        .select("id, order_id, amount, status")
        .eq("order_id", parsedOrderId)
        .eq("status", "pending");

      if (payError) {
        return res.status(500).json({ error: payError.message || "خطا در بررسی پرداخت‌ها" });
      }

      if (!payments || payments.length === 0) {
        return res.status(400).json({
          error: "هیچ پرداخت در انتظار تاییدی برای این سفارش یافت نشد"
        });
      }

      targetPayments = payments;
    }

    const orderIdToUpdate = targetPayments[0].order_id;
    const paymentIds = targetPayments.map(p => p.id);

    // ── دریافت اطلاعات سفارش قبل از تغییر ───────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("crm_orders")
      .select("id, workflow_status, order_status")
      .eq("id", orderIdToUpdate)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "سفارش مرتبط پیدا نشد" });
    }

    // ── مرحله 2: بروزرسانی وضعیت پرداخت(ها) ───────────────────────────────
    if (action === "reject") {
      // رد پرداخت: فقط وضعیت پرداخت تغییر می‌کند
      const { error: updatePayError } = await supabase
        .from("crm_payments")
        .update({
          status: "rejected",
          verified_at: now,
          verified_by: admin.id,
          admin_note: admin_notes?.trim() || null
        })
        .in("id", paymentIds)
        .eq("status", "pending");

      if (updatePayError) {
        console.error("[crm-payment-verify] payment reject error:", updatePayError.message);
        return res.status(500).json({ error: updatePayError.message || "خطا در رد پرداخت" });
      }

      // ثبت تاریخچه برای reject
      await supabase
        .from("crm_order_status_log")
        .insert({
          order_id: orderIdToUpdate,
          from_status: order.order_status,
          to_status: order.order_status, // وضعیت سفارش تغییر نمی‌کند
          changed_by: admin.id,
          note: `رد پرداخت توسط ادمین. ${admin_notes ? `توضیحات: ${admin_notes}` : ""}`,
          created_at: now
        });

      return res.status(200).json({
        ok: true,
        action: "reject",
        rejected_payments: paymentIds.length,
        order_status_unchanged: true
      });
    }

    // ── مرحله 3: تایید پرداخت و بروزرسانی سفارش ─────────────────────────────
    const { error: updatePayError } = await supabase
      .from("crm_payments")
      .update({
        status: "verified",
        verified_at: now,
        verified_by: admin.id,
        admin_note: admin_notes?.trim() || null
      })
      .in("id", paymentIds)
      .eq("status", "pending");

    if (updatePayError) {
      console.error("[crm-payment-verify] payment verify error:", updatePayError.message);
      return res.status(500).json({ error: updatePayError.message || "خطا در تایید پرداخت" });
    }

    // ── مرحله 4: بروزرسانی سفارش ───────────────────────────────────────────
    const { data: updatedOrder, error: updateOrderError } = await supabase
      .from("crm_orders")
      .update({
        order_status: "payment_confirmed",
        workflow_status: "preparation",
        current_owner: admin.username || admin.id?.toString() || null
      })
      .eq("id", orderIdToUpdate)
      .select("id, workflow_status, order_status, proforma_status, payment_type, current_owner")
      .single();

    if (updateOrderError) {
      console.error("[crm-payment-verify] order update error — rolling back payments:", updateOrderError.message);
      
      // Rollback: بازگشت پرداخت‌ها به pending
      await supabase
        .from("crm_payments")
        .update({ 
          status: "pending", 
          verified_at: null, 
          verified_by: null, 
          admin_note: null 
        })
        .in("id", paymentIds);

      return res.status(500).json({ error: updateOrderError.message || "خطا در بروزرسانی سفارش" });
    }

    // ── مرحله 5: ثبت تاریخچه ────────────────────────────────────────────────
    await supabase
      .from("crm_order_status_log")
      .insert({
        order_id: orderIdToUpdate,
        from_status: order.order_status,
        to_status: "payment_confirmed",
        changed_by: admin.id,
        note: `تایید پرداخت توسط ادمین. ${admin_notes ? `توضیحات: ${admin_notes}` : ""}`,
        created_at: now
      });

    // ── Response ────────────────────────────────────────────────────────────
    return res.status(200).json({
      ok: true,
      action: "verify",
      order: updatedOrder,
      verified_payments: paymentIds.length,
      new_order_status: "payment_confirmed",
      new_workflow_status: "preparation"
    });

  } catch (e) {
    console.error("[crm-payment-verify] unexpected error:", e.message || e);
    return res.status(e.status || 500).json({ error: e.message || "خطای سرور" });
  }
};

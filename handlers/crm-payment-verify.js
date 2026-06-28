const { supabase, cors, requireAdmin } = require("./_lib");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "متد مجاز نیست" });
  }

  try {
    // ── Auth: فقط admin/super_admin مجاز است ───────────────────────────────
    const admin = requireAdmin(req);

    // ── Resolve crm_admin_users.id (BIGINT) from JWT username ──────────────
    // JWT payload contains admin.username (set from users table at login).
    // crm_admin_users shares the same username, so we use it as the bridge
    // to get the BIGINT id required by crm_order_status_log.changed_by (INTEGER).
    if (!admin.username) {
      return res.status(401).json({ error: "Admin username missing from token" });
    }
    const { data: crmAdminUser, error: adminLookupError } = await supabase
      .from("crm_admin_users")
      .select("id")
      .eq("username", admin.username)
      .single();

    if (adminLookupError || !crmAdminUser) {
      console.error("[crm-payment-verify] admin lookup failed:", adminLookupError?.message || "no record");
      return res.status(403).json({ error: "Admin is not registered in CRM admin users" });
    }
    const adminUserId = crmAdminUser.id; // BIGINT — for changed_by

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
        .select("id, amount, status, note")
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
      // حالت همه پرداخت‌های pending یک سفارش — نیاز به payment_ids
      return res.status(400).json({
        error: "برای تایید گروهی، لطفاً payment_ids را به صورت آرایه ارسال کنید"
      });
    }

    // استخراج order_id از فیلد note (فرمت: "سفارش #52 - روش پرداخت: ...")
    let orderIdToUpdate = null;
    const noteMatch = targetPayments[0]?.note?.match(/سفارش #(\d+)/);
    if (noteMatch) orderIdToUpdate = parseInt(noteMatch[1], 10);
    // اگر order_id مستقیماً در body داده شده باشد، اولویت دارد
    if (!orderIdToUpdate && order_id) orderIdToUpdate = Number(order_id);
    if (!orderIdToUpdate) {
      return res.status(400).json({ error: "شناسه سفارش یافت نشد. لطفاً order_id را در body ارسال کنید" });
    }
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
          changed_by: adminUserId,
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
        changed_by: adminUserId,
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

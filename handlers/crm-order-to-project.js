const { supabase, cors, requireAdmin } = require('./_lib');

// ─── Mapping مراحل کاری ──────────────────────────────────────────────────────
// هر مرحله: stage name, assignee (username), توضیحات
const TASK_STAGES = [
  {
    stage: 'sales_review',
    assignee: 'ardestani',
    details: {
      action: 'determine_payment_type',
      description: 'بررسی اولیه فروش و تعیین نوع پرداخت (نقدی/اعتباری/ترکیبی)'
    }
  },
  {
    stage: 'proforma_pending',
    assignee: 'dolatkhah',
    details: {
      action: 'prepare_proforma',
      description: 'آماده‌سازی و صدور پیش‌فاکتور'
    }
  },
  {
    stage: 'proforma_sent',
    assignee: 'customer',
    details: {
      action: 'customer_self_assign',
      description: 'بررسی و تأیید پیش‌فاکتور توسط مشتری'
    }
  },
  {
    stage: 'payment_pending',
    assignee: 'dolatkhah',
    details: {
      action: 'follow_payment',
      description: 'پیگیری و ثبت پرداخت مشتری'
    }
  },
  {
    stage: 'preparation',
    assignee: 'hosseini',
    details: {
      action: 'prepare_goods',
      description: 'آماده‌سازی کالا در انبار'
    }
  },
  {
    stage: 'exit_approval',
    assignee: 'serajeddin',
    details: {
      action: 'generate_invoice_and_sepidar',
      description: 'صدور فاکتور نهایی، ثبت در سپیدار و تأیید خروج',
      generate_invoice: true,
      sepidar_registration: true
    }
  },
  {
    stage: 'ready_to_ship',
    assignee: 'moradi',
    details: {
      action: 'prepare_shipping',
      description: 'آماده‌سازی برای بارگیری'
    }
  },
  {
    stage: 'shipping',
    assignee: 'moradi',
    details: {
      action: 'ship_order',
      description: 'حمل و ارسال کالا به مشتری'
    }
  }
];

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'متد مجاز نیست' });
  }

  try {
    // ── Auth: فقط admin/super_admin ──────────────────────────────────────────
    const admin = requireAdmin(req);

    // ── Validate input ───────────────────────────────────────────────────────
    const { order_id } = req.body || {};
    if (!order_id) {
      return res.status(400).json({ error: 'order_id الزامی است' });
    }

    const parsedId = Number(order_id);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      return res.status(400).json({ error: 'order_id معتبر نیست' });
    }

    // ── دریافت سفارش ─────────────────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('crm_orders')
      .select('*, crm_customers!inner(name, status)')
      .eq('id', parsedId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'سفارش پیدا نشد' });
    }

    // ── بررسی: آیا قبلاً tasks ایجاد شده؟ ────────────────────────────────────
    const { data: existingTasks } = await supabase
      .from('crm_order_tasks')
      .select('id')
      .eq('order_id', parsedId)
      .limit(1);

    if (existingTasks && existingTasks.length > 0) {
      return res.status(409).json({
        error: 'مراحل کاری برای این سفارش قبلاً ایجاد شده است',
        order_id: parsedId
      });
    }

    // ── ساختن آرایه tasks ────────────────────────────────────────────────────
    const paymentType = order.payment_type || 'cash';
    const workflowStatus = order.workflow_status || 'submitted';

    const tasks = TASK_STAGES.map((stageDef, index) => {
      // کپی details و اضافه کردن payment_type
      const stageDetails = {
        ...stageDef.details,
        payment_type: paymentType,
        order_workflow_status: workflowStatus
      };

      return {
        order_id: parsedId,
        stage: stageDef.stage,
        assignee: stageDef.assignee,
        status: 'pending',
        details: stageDetails,
        order_index: index + 1,
        created_at: new Date().toISOString()
      };
    });

    // ── Bulk insert tasks ────────────────────────────────────────────────────
    const { data: createdTasks, error: insertError } = await supabase
      .from('crm_order_tasks')
      .insert(tasks)
      .select();

    if (insertError) {
      return res.status(500).json({
        error: insertError.message || 'خطا در ایجاد مراحل کاری'
      });
    }

    // ── ثبت در تاریخچه ───────────────────────────────────────────────────────
    await supabase
      .from('crm_order_history')
      .insert({
        order_id: parsedId,
        from_status: workflowStatus,
        to_status: workflowStatus,
        changed_by: admin.username || admin.id?.toString() || 'system',
        notes: `ایجاد ${tasks.length} مرحله کاری برای سفارش #${parsedId}`,
        created_at: new Date().toISOString()
      });

    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(201).json({
      ok: true,
      order_id: parsedId,
      workflow_status: workflowStatus,
      payment_type: paymentType,
      customer_status: order.crm_customers?.status || 'unknown',
      tasks: createdTasks || [],
      total_stages: createdTasks?.length || 0
    });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'خطای سرور' });
  }
};

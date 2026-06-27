const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

// فیلدهایی که در schema وجود ندارند یا نباید از client نوشته شوند
const BLOCKED_POST = new Set(['id', 'deleted_at', 'assigned_to', 'payment_status', 'order_number', 'items', 'workflow_status', 'current_owner']);
const BLOCKED_PUT  = new Set(['id', 'created_at', 'deleted_at', 'customer_id', 'assigned_to', 'payment_status', 'order_number', 'items', 'workflow_status', 'current_owner']);

// ─── helper: ایجاد خودکار پروژه پس از تأیید سفارش ───
async function autoCreateProject(orderId, adminUserId) {
  const numericOrderId = Number(orderId);

  // بررسی: آیا پروژه قبلاً ایجاد شده؟
  const { data: existing, error: exErr } = await supabase
    .from('projects')
    .select('id')
    .eq('order_id', numericOrderId)
    .limit(1);

  if (exErr) return;
  if (existing && existing.length > 0) return;

  // اطلاعات سفارش + مشتری
  const { data: order, error: ordErr } = await supabase
    .from('crm_orders')
    .select('*, crm_customers(name)')
    .eq('id', numericOrderId)
    .single();

  if (ordErr || !order) return;

  const customerName = order.crm_customers?.name || '';
  const orderLabel = order.order_number || `#${order.id}`;
  const title = customerName
    ? `پروژه ${customerName} - ${orderLabel}`
    : `پروژه ${orderLabel}`;

  // ایجاد پروژه
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .insert({
      order_id: numericOrderId,
      title,
      description: `پروژه خودکار ایجاد شده از سفارش #${order.id}`,
      manager_id: adminUserId,
      status: 'active'
    })
    .select()
    .single();

  if (projErr || !project) return;

  // مدیر سفارش را به عنوان عضو پروژه اضافه کن
  if (adminUserId) {
    try {
      await supabase
        .from('project_members')
        .insert({ project_id: project.id, user_id: adminUserId, role: 'manager' });
    } catch (_) {} // ignore duplicate
  }
}

// mapping: status → order_status ، notes → note
const VALID_PROFORMA_STATUSES = new Set(['draft', 'issued', 'approved', 'rejected']);
const VALID_PAYMENT_TYPES = new Set(['cash', 'credit', 'mixed']);
const VALID_SALES_CHANNELS = new Set(['retail', 'wholesale']);
const VALID_SOURCE_APPS = new Set(['admin-panel', 'wholesale-portal', 'website']);
const VALID_ORDER_STATUSES = new Set([
  'registered', 'pending_review', 'confirmed', 'proforma_issued',
  'pending_payment', 'payment_confirmed', 'in_production',
  'ready_to_ship', 'shipped', 'delivered', 'cancelled'
]);

function mapOrderFields(body) {
  const out = { ...body };
  if (out.status !== undefined && out.order_status === undefined) {
    out.order_status = out.status;
  }
  delete out.status;
  if (out.notes !== undefined && out.note === undefined) {
    out.note = out.notes;
  }
  delete out.notes;
  // حذف مقادیر نامعتبر برای فیلدهای استراتژیک
  if (out.proforma_status !== undefined && !VALID_PROFORMA_STATUSES.has(out.proforma_status)) {
    delete out.proforma_status;
  }
  if (out.sales_channel !== undefined && !VALID_SALES_CHANNELS.has(out.sales_channel)) {
    delete out.sales_channel;
  }
  if (out.source_app !== undefined && !VALID_SOURCE_APPS.has(out.source_app)) {
    delete out.source_app;
  }
  return out;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  try {
    requireAuth(req);

    // GET: لیست سفارش‌ها
    if (req.method === 'GET') {
      const user = requireAuth(req);
      const { id, customer_id, status, workflow_status, assignee, limit = 500, offset = 0 } = req.query;

      let query = supabase
        .from('crm_orders')
        .select('*, crm_customers(name, phone)');

      // enforce customer_id from JWT for portal customers
      if (user.type === 'customer') {
        query = query.eq('customer_id', user.id);
      } else if (customer_id) {
        query = query.eq('customer_id', customer_id);
      }

      if (id) query = query.eq('id', id);
      if (status) {
        if (!VALID_ORDER_STATUSES.has(status)) {
          return res.status(400).json({ error: `status '${status}' معتبر نیست` });
        }
        query = query.eq('order_status', status);
      }

      // ── Phase 2: فیلتر workflow_status ─────────────────────────────────
      if (workflow_status) {
        query = query.eq('workflow_status', workflow_status);
      }

      // ── Phase 2: فیلتر assignee (از طریق crm_order_tasks) ──────────────
      if (assignee && user.type !== 'customer') {
        // دریافت order_ids که task با assignee مشخص دارند
        const { data: assignedTasks } = await supabase
          .from('crm_order_tasks')
          .select('order_id')
          .eq('assignee', assignee)
          .eq('status', 'pending');

        if (assignedTasks && assignedTasks.length > 0) {
          const orderIds = [...new Set(assignedTasks.map(t => t.order_id))];
          query = query.in('id', orderIds);
        } else {
          // هیچ task تطبیقی نداریم → خالی برگردان
          return res.json([]);
        }
      }

      query = query.order('created_at', { ascending: false })
                   .range(Number(offset), Number(offset) + Number(limit) - 1);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST: ایجاد سفارش — کاربر احراز هویت‌شده (پورتال عمده + ادمین)
    if (req.method === 'POST') {
      const user = requireAuth(req);
      const mapped = mapOrderFields(req.body || {});

      // enforce customer_id from JWT for portal customers
      if (user.type === 'customer') {
        mapped.customer_id = user.id;
      }

      if (!mapped.customer_id) return res.status(400).json({ error: 'customer_id الزامی است' });

      // ── Phase 1: اعتبارسنجی payment_type ─────────────────────────────────
      if (mapped.payment_type !== undefined) {
        if (!VALID_PAYMENT_TYPES.has(mapped.payment_type)) {
          return res.status(400).json({ error: 'payment_type باید cash, credit یا mixed باشد' });
        }
      }

      // حذف فیلدهای ممنوع
      const payload = {};
      for (const [k, v] of Object.entries(mapped)) {
        if (!BLOCKED_POST.has(k)) payload[k] = v;
      }

      // مقدار پیش‌فرض
      if (!payload.order_status) payload.order_status = 'registered';

      // ── Phase 1: تعیین workflow_status بر اساس وضعیت مشتری ──────────────
      if (payload.customer_id) {
        const { data: customer, error: custErr } = await supabase
          .from('crm_customers')
          .select('status')
          .eq('id', payload.customer_id)
          .maybeSingle();

        if (!custErr && customer) {
          const customerStatus = customer.status || 'pending';
          if (customerStatus === 'pending') {
            payload.workflow_status = 'customer_pending';
          } else if (customerStatus === 'active') {
            payload.workflow_status = 'sales_review';
          } else {
            payload.workflow_status = 'submitted';
          }
        } else {
          payload.workflow_status = 'submitted';
        }
      } else {
        payload.workflow_status = 'submitted';
      }

      const { data, error } = await supabase
        .from('crm_orders')
        .insert(payload)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // ─── helper: اجرای به‌روزرسانی سفارش و ایجاد پروژه ───
    const doUpdate = async (id, body, me) => {
      const mapped = mapOrderFields(body);
      const payload = {};
      for (const [k, v] of Object.entries(mapped)) {
        if (!BLOCKED_PUT.has(k)) payload[k] = v;
      }

      if (Object.keys(payload).length === 0) {
        const err = new Error('هیچ فیلدی برای آپدیت ارسال نشده');
        err.status = 400;
        throw err;
      }

      const { data, error } = await supabase
        .from('crm_orders')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        const err = new Error('سفارش پیدا نشد');
        err.status = 404;
        throw err;
      }

      // اگر وضعیت به proforma_issued تغییر کرد → ایجاد خودکار پروژه
      if (payload.order_status === 'proforma_issued') {
        await autoCreateProject(id, me.id);
      }

      return data;
    };

    // PUT: ویرایش سفارش — فقط admin+ (id در body)
    if (req.method === 'PUT') {
      requireAdmin(req);
      const me = requireAuth(req);
      const { id, ...rest } = req.body || {};
      if (!id) throw Object.assign(new Error('id الزامی است'), { status: 400 });

      const data = await doUpdate(id, rest, me);
      return res.json(data);
    }

    // PATCH: ویرایش سفارش — فقط admin+ (id در query string ?id=eq.X)
    if (req.method === 'PATCH') {
      requireAdmin(req);
      const me = requireAuth(req);
      const match = req.query.id && req.query.id.match(/^eq\.(\d+)$/);
      if (!match) throw Object.assign(new Error('id=eq.X در query الزامی است'), { status: 400 });

      const data = await doUpdate(match[1], req.body || {}, me);
      return res.json(data);
    }

    // DELETE: حذف سفارش — فقط super_admin
    if (req.method === 'DELETE') {
      requireSuperAdmin(req);
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id الزامی است' });

      const { error } = await supabase
        .from('crm_orders')
        .delete()
        .eq('id', id);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'متد مجاز نیست' });

  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message });
  }
};

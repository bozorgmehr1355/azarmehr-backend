const { supabase, cors, requireAuth, requireAdmin, requireSuperAdmin } = require('./_lib');

const TABLE = 'crm_communications';

const BLOCKED_POST = ['id', 'created_at', 'deleted_at'];
const BLOCKED_PUT = ['id', 'created_at', 'deleted_at'];
const ALLOWED_FIELDS = new Set([
  'customer_id', 'order_id', 'communication_type', 'status',
  'subject', 'message', 'direction', 'channel', 'communication_date'
]);

function cleanPayload(body, blockedFields) {
  const payload = { ...(body || {}) };
  for (const field of blockedFields) {
    delete payload[field];
  }
  // whitelist: فقط فیلدهای مجاز باقی بمانند
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_FIELDS.has(key)) {
      delete payload[key];
    }
  }
  return payload;
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  try {
    if (req.method === 'GET') {
      requireAuth(req);

      const {
        id,
        customer_id,
        order_id,
        limit = 100,
        offset = 0,
      } = req.query || {};

      let query = supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      const stripEq = (v) => String(v).replace(/^eq\./, '');
      if (id) query = query.eq('id', stripEq(id));
      if (customer_id) query = query.eq('customer_id', stripEq(customer_id));
      if (order_id) query = query.eq('order_id', stripEq(order_id));

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      requireAdmin(req);

      const payload = cleanPayload(req.body, BLOCKED_POST);
      if (!payload.customer_id) {
        return res.status(400).json({ error: 'customer_id is required' });
      }
      if (!payload.message) {
        return res.status(400).json({ error: 'message is required' });
      }

      const { data, error } = await supabase
        .from(TABLE)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      requireAdmin(req);

      const { id, ...body } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const payload = cleanPayload(body, BLOCKED_PUT);

      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      requireSuperAdmin(req);

      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
    });
  }
};

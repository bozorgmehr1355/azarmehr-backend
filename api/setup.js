const { bcrypt, cors, supabase } = require('./_lib');

// کاربران از متغیر محیطی SEED_PASSWORDS_JSON خوانده می‌شوند
let USERS;
try {
  const raw = process.env.SEED_PASSWORDS_JSON || '[]';
  USERS = JSON.parse(raw);
  if (!Array.isArray(USERS)) { USERS = []; }
} catch (e) {
  console.error('Failed to parse SEED_PASSWORDS_JSON:', e.message);
  USERS = [];
}

// مپینگ system_role طبق مستندات پروژه
const SYSTEM_ROLES = {
  'bozorgmehr': 'super_admin',
  'karimloo': 'super_admin',
  'seraj': 'admin',
  'ardestani': 'admin'
  // بقیه به صورت پیش‌فرض employee هستند
};

// ساختار سازمانی
const ORG = {1:null,2:null,3:2,4:2,5:4,6:2,7:3,8:1,9:2,10:6,11:3,12:3};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ENV gate — فقط در صورتی اجرا شود که SETUP_ENABLED=true باشد
  if (process.env.SETUP_ENABLED !== 'true') {
    return res.status(403).json({ error: 'Setup is disabled via SETUP_ENABLED env var' });
  }

  // امنیت: secret از متغیر محیطی خوانده می‌شود
  const SETUP_SECRET = process.env.SETUP_SECRET || 'azarmehr-setup-2024';
  if (req.query.secret !== SETUP_SECRET) {
    return res.status(403).json({error: 'غیرمجاز'});
  }

  try {
    let created = 0;
    for (const u of USERS) {
      const hash = bcrypt.hashSync(u.password, 8);
      const systemRole = SYSTEM_ROLES[u.username] || 'employee';

      const { error: insertUserError } = await supabase
        .from('users')
        .upsert(
          { full_name: u.name, username: u.username, password: hash, role: u.role, system_role: systemRole, avatar: u.avatar },
          { onConflict: 'username' }
        );
      if (insertUserError) throw insertUserError;

      const { data: user, error: selectUserError } = await supabase
        .from('users')
        .select('id')
        .eq('username', u.username)
        .single();
      if (selectUserError) throw selectUserError;

      if (user) {
        created++;
        try {
          const mgr = ORG[u.id];
          await supabase.from('org_chart').upsert(
            { user_id: user.id, manager_id: mgr },
            { onConflict: 'user_id', ignoreDuplicates: true }
          );
        } catch(_) { /* org_chart table may not exist yet */ }
      }
    }

    res.json({
      ok: true,
      created,
      message: `${created} کاربر با system_role ایجاد شد`
    });

  } catch (e) {
    res.status(500).json({error: e.message});
  }
};

const { bcrypt, cors, supabase } = require('./_lib');

// 12 کاربر اولیه
const USERS = [
  {id:1, name:'محمدرضا بزرگمهر', username:'bozorgmehr', password:'Azr@1401', role:'دیجیتال مارکتینگ', avatar:'👨‍💼'},
  {id:2, name:'سعید کریم‌لو', username:'karimloo', password:'Azr@1402', role:'مدیر عامل', avatar:'👔'},
  {id:3, name:'امید سراج‌الدینی', username:'seraj', password:'Azr@1403', role:'مدیر امور مالی', avatar:'💼'},
  {id:4, name:'لیلا اردستانی', username:'ardestani', password:'Azr@1404', role:'مدیر فروش', avatar:'👩‍💼'},
  {id:5, name:'ملیکا کمازانی', username:'kamazani', password:'Azr@1405', role:'بازرگانی خارجی', avatar:'🌍'},
  {id:6, name:'مجتبی قاسم‌بیک', username:'ghasembik', password:'Azr@1406', role:'مدیر تولید', avatar:'⚙️'},
  {id:7, name:'فیض‌الله حسینی', username:'hosseini', password:'Azr@1407', role:'انباردار', avatar:'📦'},
  {id:8, name:'فرهاد محسن‌زاده', username:'mohsenzadeh', password:'Azr@1408', role:'تحصیلدار', avatar:'📋'},
  {id:9, name:'فغانی', username:'faghani', password:'Azr@1409', role:'تشریفات', avatar:'🎩'},
  {id:10, name:'حسین مرادی', username:'moradi', password:'Azr@1410', role:'راننده', avatar:'🚚'},
  {id:11, name:'المیرا دولتخواه', username:'dolatkhah', password:'Azr@1411', role:'حسابدار فروش', avatar:'💰'},
  {id:12, name:'کوثر اعرابی', username:'aarabi', password:'Azr@1412', role:'خزانه‌دار', avatar:'🏦'}
];

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

  // امنیت: فقط با secret قابل اجرا
  if (req.query.secret !== 'azarmehr-setup-2024') {
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

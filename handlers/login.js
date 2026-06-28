const { supabase, jwt, JWT_SECRET, cors } = require('./_lib');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, username, password, role, system_role, avatar')
      .eq('username', username)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    const user = data;

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, system_role: user.system_role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.full_name,
        username: user.username,
        role: user.role,
        system_role: user.system_role,
        avatar: user.avatar
      }
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

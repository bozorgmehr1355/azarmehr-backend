const { Client } = require('pg');

async function tryConnect(host, port, label) {
  const client = new Client({
    host,
    port,
    database: 'postgres',
    user: 'postgres.apscmdspkitpwzhizgkq',
    password: 'F@rnam_1390',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
  try {
    await client.connect();
    console.log(`✅ ${label}: Connected!`);
    const r = await client.query('ALTER TABLE scorpion_orders ADD CONSTRAINT scorpion_orders_order_number_unique UNIQUE (order_number);');
    console.log(`✅ ${label}: SUCCESS -`, r.command);
    await client.end();
    return true;
  } catch (e) {
    console.log(`❌ ${label}: ${e.message.slice(0, 100)}`);
    await client.end().catch(() => {});
    return false;
  }
}

(async () => {
  const hosts = [
    { host: 'aws-0-eu-central-1.pooler.supabase.com', port: 6543, label: 'Session pooler 6543' },
    { host: 'aws-0-eu-central-1.pooler.supabase.com', port: 6579, label: 'Transaction pooler 6579' },
    { host: 'db.apscmdspkitpwzhizgkq.supabase.co', port: 5432, label: 'Direct 5432' },
    { host: 'eu-central-1.pooler.supabase.com', port: 6543, label: 'Session pooler eu-central-1' },
    { host: 'eu-central-1.pooler.supabase.com', port: 6579, label: 'Transaction pooler eu-central-1' },
  ];
  for (const h of hosts) {
    if (await tryConnect(h.host, h.port, h.label)) {
      console.log('Done!');
      process.exit(0);
    }
  }
  console.log('All connection attempts failed.');
})();

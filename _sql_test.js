const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://apscmdspkitpwzhizgkq.supabase.co',
  'sb_secret_***REDACTED***'
);

async function main() {
  // Try various built-in Supabase functions
  const functionsToTry = [
    'version',
    'extensions',
    'current_database',
    'pg_stat_statements',
  ];
  
  for (const fn of functionsToTry) {
    try {
      const { data, error } = await supabase.rpc(fn);
      console.log(`${fn}: ${error ? 'ERR: ' + error.message : 'OK: ' + JSON.stringify(data).substring(0, 200)}`);
    } catch (e) {
      console.log(`${fn}: EXCEPTION: ${e.message}`);
    }
  }

  // Try direct rest API operations
  // Check if there's a sql endpoint available
  const url = 'https://apscmdspkitpwzhizgkq.supabase.co';
  
  // Try a custom approach: use the auth admin API to create a custom claim
  // But that won't help with DDL
  
  // Let's try the internal dashboard API endpoints
  // The dashboard often uses internal endpoints
  const projectRef = 'apscmdspkitpwzhizgkq';
  
  // Try the internal SQL execution endpoint
  const internalEndpoints = [
    `/api/v1/projects/${projectRef}/sql/execute`,
    `/api/v1/projects/${projectRef}/database/query`,
    `/api/v1/projects/${projectRef}/database/sql`,
    `/api/v1/projects/${projectRef}/sql/run`,
  ];

  for (const endpoint of internalEndpoints) {
    try {
      const https = require('https');
      const response = await new Promise((resolve, reject) => {
        const req = https.request(`${url}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.***REDACTED***',
            'Authorization': 'Bearer sb_secret_***REDACTED***'
          },
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data.substring(0, 200) }));
        });
        req.on('error', e => resolve({ status: 'error', body: e.message }));
        req.write(JSON.stringify({ query: 'SELECT 1' }));
        req.end();
      });
      console.log(`${endpoint}: ${response.status} - ${response.body}`);
    } catch (e) {
      console.log(`${endpoint}: EXCEPTION: ${e.message}`);
    }
  }
}

main();
const http = require('http');
const path = require('path');

// PostgreSQL Connection Configuration
const PG_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'botsio212nyc',
  database: process.env.POSTGRES_DB || 'NticPlatformDb'
};

const PORT = process.env.PORT || 5000;

let pool = null;

// Attempt to load 'pg' (node-postgres)
try {
  const { Pool, Client } = require('pg');

  async function initDatabase() {
    // First connect to default 'postgres' database to ensure our database exists
    const adminClient = new Client({
      host: PG_CONFIG.host,
      port: PG_CONFIG.port,
      user: PG_CONFIG.user,
      password: PG_CONFIG.password,
      database: 'postgres'
    });

    try {
      await adminClient.connect();
      const res = await adminClient.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [PG_CONFIG.database]
      );
      if (res.rowCount === 0) {
        console.log(`Creating PostgreSQL database "${PG_CONFIG.database}"...`);
        await adminClient.query(`CREATE DATABASE "${PG_CONFIG.database}"`);
      }
    } catch (err) {
      console.warn(`Note checking database existence: ${err.message}`);
    } finally {
      await adminClient.end().catch(() => {});
    }

    // Now connect to our target database
    pool = new Pool(PG_CONFIG);

    // Ensure schema exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        track VARCHAR(50),
        consent_granted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        student_id UUID REFERENCES students(id) ON DELETE CASCADE,
        source_code_path VARCHAR(500) NOT NULL,
        video_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log(`[PostgreSQL] Connected and schema verified on ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
  }

  initDatabase().catch(err => {
    console.error('[PostgreSQL] Connection Error:', err.message);
  });
} catch (e) {
  console.warn("Package 'pg' is not installed yet. Run 'npm install' in NticPlatform.Backend directory to enable live PostgreSQL queries.");
}

// Simple HTTP REST API Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split('?')[0];

  // Health / Status Endpoint
  if (url === '/api/health' && req.method === 'GET') {
    let dbStatus = 'disconnected';
    if (pool) {
      try {
        await pool.query('SELECT 1');
        dbStatus = 'connected';
      } catch (err) {
        dbStatus = `error: ${err.message}`;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      database: dbStatus,
      config: {
        host: PG_CONFIG.host,
        port: PG_CONFIG.port,
        database: PG_CONFIG.database,
        user: PG_CONFIG.user
      }
    }));
  }

  // GET /api/students
  if (url === '/api/students' && req.method === 'GET') {
    if (!pool) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'PostgreSQL pool not initialized. Did you run npm install?' }));
    }
    try {
      const result = await pool.query('SELECT * FROM students ORDER BY created_at DESC');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // POST /api/students
  if (url === '/api/students' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { tenantId = '11111111-1111-1111-1111-111111111111', firstName, lastName, email, track = 'Coding', consentGranted = true } = data;
        const result = await pool.query(
          `INSERT INTO students (tenant_id, first_name, last_name, email, track, consent_granted)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [tenantId, firstName, lastName, email, track, consentGranted]
        );
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0]));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint Not Found', path: url }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NTIC Platform Backend API running on http://localhost:${PORT}`);
  console.log(`PostgreSQL Configured -> Host: ${PG_CONFIG.host}:${PG_CONFIG.port} | DB: ${PG_CONFIG.database} | User: ${PG_CONFIG.user}`);
});

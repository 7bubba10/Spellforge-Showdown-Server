// src/db.js
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[db] Missing DATABASE_URL in .env');
}

// Normalize the connection string to avoid sslmode conflicts
let connectionString = process.env.DATABASE_URL;
try {
  const url = new URL(process.env.DATABASE_URL);
  // Drop sslmode from query to let our explicit ssl config win
  url.searchParams.delete('sslmode');
  connectionString = url.toString();
} catch (e) {
  // If URL parsing fails, just fall back to raw string
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // accept self-signed / managed CA chain
  },
});

/**
 * Simple connection test for local dev:
 * node src/db.js
 */
async function testConnection() {
  try {
    const res = await pool.query('SELECT 1 AS ok');
    console.log('[db] connection OK, result =', res.rows[0].ok);
  } catch (err) {
    console.error('[db] connection FAILED:', err.message);
  } finally {
    await pool.end();
  }
}

// Only run this when executing directly: `node src/db.js`
if (require.main === module) {
  testConnection();
}

module.exports = { pool };
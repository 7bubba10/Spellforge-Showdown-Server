// src/db-test.js
const { pool } = require('./db');

(async () => {
  try {
    // 1) Ensure a small test table exists (safe, separate from your main schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_ping (
        id SERIAL PRIMARY KEY,
        note TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2) Insert one row
    const insert = await pool.query(
      `INSERT INTO test_ping (note) VALUES ($1) RETURNING id, note, created_at`,
      ['hello from node']
    );
    console.log('[db-test] inserted row:', insert.rows[0]);

    // 3) Read last 5 rows back
    const select = await pool.query(
      `SELECT id, note, created_at
       FROM test_ping
       ORDER BY id DESC
       LIMIT 5`
    );
    console.log('[db-test] recent rows:');
    console.table(select.rows);
  } catch (err) {
    console.error('[db-test] FAILED:', err.message);
  } finally {
    await pool.end();
  }
})();
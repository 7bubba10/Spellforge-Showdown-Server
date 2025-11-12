// src/models/lobbyModel.js
const { pool } = require('../db');

async function createLobbyRecord(lobbyCode) {
  try {
    const insert = await pool.query(
      `INSERT INTO lobby (lobby_code)
       VALUES ($1)
       ON CONFLICT (lobby_code) DO NOTHING
       RETURNING lobby_id, lobby_code, created_at`,
      [lobbyCode]
    );
    if (insert.rows.length) return insert.rows[0];

    const existing = await pool.query(
      `SELECT lobby_id, lobby_code, created_at
       FROM lobby
       WHERE lobby_code = $1`,
      [lobbyCode]
    );
    return existing.rows[0] || null;
  } catch (err) {
    console.error('[lobbyModel] createLobbyRecord failed:', err.message);
    throw err;
  }
}

async function getLobbyByCode(lobbyCode) {
  try {
    const r = await pool.query(
      `SELECT lobby_id, lobby_code, created_at
       FROM lobby
       WHERE lobby_code = $1`,
      [lobbyCode]
    );
    return r.rows[0] || null;
  } catch (err) {
    console.error('[lobbyModel] getLobbyByCode failed:', err.message);
    throw err;
  }
}

async function listLobbies(limit = 50) {
  try {
    const r = await pool.query(
      `SELECT lobby_id, lobby_code, created_at
       FROM lobby
       ORDER BY lobby_id DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  } catch (err) {
    console.error('[lobbyModel] listLobbies failed:', err.message);
    throw err;
  }
}

module.exports = { createLobbyRecord, getLobbyByCode, listLobbies };
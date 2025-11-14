// src/models/lobbyMemberModel.js
const { pool } = require('../db');

/* ---------- helpers & cached metadata ---------- */
const SCHEMA = 'public';
const qident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const qfull  = (name) => `${qident(SCHEMA)}.${qident(name)}`;

let USER_TABLE_NAME  = null;   // raw table name as it exists (e.g., User)
let USER_TABLE_IDENT = null;   // fully-qualified: "public"."User"
let PASS_COL         = null;   // 'password_hash' or 'password'

async function pickUserLikeTable() {
  // Try exact candidates via to_regclass (handles quoting & case)
  let r = await pool.query(`SELECT to_regclass($1) AS ok`, [`${SCHEMA}."User"`]);
  if (r.rows[0].ok) return 'User';

  r = await pool.query(`SELECT to_regclass($1) AS ok`, [`${SCHEMA}.user`]);
  if (r.rows[0].ok) return 'user';

  r = await pool.query(`SELECT to_regclass($1) AS ok`, [`${SCHEMA}.users`]);
  if (r.rows[0].ok) return 'users';

  // Fallback: anything with 'user' in the name
  r = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND lower(table_name) LIKE '%user%'
      ORDER BY table_name
      LIMIT 1`,
    [SCHEMA]
  );
  if (r.rows.length) return r.rows[0].table_name;

  throw new Error(`No user-like table found in schema ${SCHEMA}`);
}

async function resolveUserMetaOnce() {
  if (USER_TABLE_IDENT && PASS_COL) return;

  USER_TABLE_NAME  = await pickUserLikeTable();   // e.g., 'User'
  USER_TABLE_IDENT = qfull(USER_TABLE_NAME);      // e.g., "public"."User"

  // Inspect columns on the exact table we picked
  const cols = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name   = $2`,
    [SCHEMA, USER_TABLE_NAME]
  );
  const names = cols.rows.map(r => r.column_name);

  // Required columns
  for (const need of ['user_id', 'email']) {
    if (!names.includes(need)) {
      console.error(`[lobbyMemberModel] columns on ${USER_TABLE_NAME}:`, names);
      throw new Error(`Required column missing on ${USER_TABLE_NAME}: ${need}`);
    }
  }

  PASS_COL = names.includes('password_hash')
    ? 'password_hash'
    : (names.includes('password') ? 'password' : null);

  if (!PASS_COL) {
    console.error(`[lobbyMemberModel] columns on ${USER_TABLE_NAME}:`, names);
    throw new Error(`Neither password_hash nor password exists on ${USER_TABLE_NAME}`);
  }

  console.log('[lobbyMemberModel] resolved:', {
    USER_TABLE_NAME, PASS_COL, ident: USER_TABLE_IDENT
  });
}

/* ---------- API ---------- */

/** Return roster for a lobby (with display names if present). */
async function listLobbyMembers(lobbyId) {
  await resolveUserMetaOnce();

  const sql = `
    SELECT
      lm.lobby_id,
      lm.user_id,
      lm.team_slot,
      lm.is_ready,
      lm.joined_at,
      COALESCE(pp.display_name, u.email) AS display_name
    FROM lobbymember lm
    LEFT JOIN ${USER_TABLE_IDENT} u  ON u.user_id = lm.user_id
    LEFT JOIN playerprofile pp       ON pp.user_id = lm.user_id
    WHERE lm.lobby_id = $1
    ORDER BY lm.joined_at ASC;
  `;
  const { rows } = await pool.query(sql, [lobbyId]);
  return rows;
}

/** Insert a "guest" user + profile, then add them to the lobby. */
async function addLobbyMember({ lobbyId, userName = 'Guest' }) {
  await resolveUserMetaOnce();

  // generate a simple incremental user_id
  const next = await pool.query(
    `SELECT COALESCE(MAX(user_id), 0) + 1 AS id FROM ${USER_TABLE_IDENT};`
  );
  const userId = Number(next.rows[0].id);
  const email  = `guest+${Date.now()}@local`;

  // insert the user into the resolved table
  await pool.query(
    `INSERT INTO ${USER_TABLE_IDENT}(user_id, email, ${PASS_COL})
     VALUES ($1, $2, $3);`,
    [userId, email, 'guest']
  );

  // upsert profile display name
  await pool.query(
    `INSERT INTO playerprofile(user_id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET display_name = EXCLUDED.display_name;`,
    [userId, userName]
  );

  // add to lobby roster (idempotent on conflict)
  const ins = await pool.query(
    `INSERT INTO lobbymember (lobby_id, user_id, team_slot, is_ready)
     VALUES ($1, $2, 0, false)
     ON CONFLICT (lobby_id, user_id) DO NOTHING
     RETURNING lobby_id, user_id, team_slot, is_ready, joined_at;`,
    [lobbyId, userId]
  );

  const row =
    ins.rows[0] ||
    (await pool.query(
      `SELECT lobby_id, user_id, team_slot, is_ready, joined_at
         FROM lobbymember
        WHERE lobby_id = $1 AND user_id = $2;`,
      [lobbyId, userId]
    )).rows[0];

  return { ...row, display_name: userName };
}

module.exports = { listLobbyMembers, addLobbyMember };

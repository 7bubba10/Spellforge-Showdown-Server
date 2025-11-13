// src/models/matchModel.js
const { pool } = require('../db');

/**
 * Create a match row for a given lobby code.
 * Assumes tables/cols:
 *   lobby(lobby_id, lobby_code)
 *   match(match_id, lobby_id, map_id, mode, started_at, ended_at, winner_team_id)
 */
async function createMatchByLobbyCode({ code, mapId = null, mode = 'default' }) {
  // look up lobby_id first
  const l = await pool.query(
    `SELECT lobby_id FROM lobby WHERE lobby_code = $1`,
    [code]
  );
  if (l.rowCount === 0) throw new Error(`lobby_not_found: ${code}`);

  const lobbyId = l.rows[0].lobby_id;

  // insert match row
  const ins = await pool.query(
    `INSERT INTO match (lobby_id, map_id, mode, started_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING match_id, lobby_id, map_id, mode, started_at`,
    [lobbyId, mapId, mode]
  );
  return ins.rows[0];
}

async function endMatch({ matchId, winnerTeamId = null }) {
  const upd = await pool.query(
    `UPDATE match
       SET ended_at = NOW(), winner_team_id = $2
     WHERE match_id = $1
     RETURNING match_id, ended_at, winner_team_id`,
    [matchId, winnerTeamId]
  );
  if (upd.rowCount === 0) throw new Error(`match_not_found: ${matchId}`);
  return upd.rows[0];
}

module.exports = { createMatchByLobbyCode, endMatch };
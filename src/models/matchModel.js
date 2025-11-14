// src/models/matchModel.js
const { pool } = require('../db');

/**
 * Create a match row for a given lobby code.
 * Tables/cols expected:
 *   lobby(lobby_id, lobby_code)
 *   match(match_id, lobby_id, map_id, mode, started_at, ended_at, winner_team_id)
 */
async function createMatchByLobbyCode({ code, mapId = null, mode = 'default' }) {
  const l = await pool.query(
    'SELECT lobby_id FROM lobby WHERE lobby_code = $1',
    [code]
  );
  if (l.rowCount === 0) {
    const err = new Error('lobby_not_found');
    err.code = 'lobby_not_found';
    err.details = { code };
    throw err;
  }

  const lobbyId = l.rows[0].lobby_id;
  const ins = await pool.query(
    `INSERT INTO match (lobby_id, map_id, mode, started_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING match_id, lobby_id, map_id, mode, started_at`,
    [lobbyId, mapId, mode]
  );

  return ins.rows[0]; // { match_id, lobby_id, map_id, mode, started_at }
}

/**
 * Mark a match as ended and optionally set the winner team.
 */
async function endMatch({ matchId, winnerTeamId = null }) {
  const upd = await pool.query(
    `UPDATE match
       SET ended_at = NOW(),
           winner_team_id = $2
     WHERE match_id = $1
     RETURNING match_id, ended_at, winner_team_id`,
    [matchId, winnerTeamId]
  );

  if (upd.rowCount === 0) {
    const err = new Error('match_not_found');
    err.code = 'match_not_found';
    err.details = { matchId };
    throw err;
  }
  return upd.rows[0]; // { match_id, ended_at, winner_team_id }
}

/**
 * Fetch a single match by id (handy for debugging).
 */
async function getMatchById(matchId) {
  const r = await pool.query(
    `SELECT match_id, lobby_id, map_id, mode, started_at, ended_at, winner_team_id
       FROM match
      WHERE match_id = $1`,
    [matchId]
  );
  return r.rows[0] || null;
}

module.exports = { createMatchByLobbyCode, endMatch, getMatchById };

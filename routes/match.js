// routes/match.js
const express = require('express');
const router = express.Router();
const {
  createMatchByLobbyCode,
  endMatch,
  getMatchById,
} = require('../src/models/matchModel');

// quick sanity so you can tell this router is actually mounted
router.get('/_ping', (_req, res) => res.json({ ok: true, route: 'match', wired: 'db' }));

// POST /api/match/start  -> inserts into match and returns the row
router.post('/start', async (req, res) => {
  try {
    const { roomCode, mapId = null, mode = 'default' } = req.body || {};
    if (!roomCode) return res.status(400).json({ error: 'roomCode_required' });

    const row = await createMatchByLobbyCode({ code: roomCode, mapId, mode });
    return res.status(201).json({
      status: 'started',
      matchId: row.match_id,
      lobbyId: row.lobby_id,
      startedAt: row.started_at,
      mode: row.mode,
      mapId: row.map_id ?? null,
    });
  } catch (e) {
    console.error('[match/start]', e);
    if (e.code === 'lobby_not_found') return res.status(404).json({ error: 'lobby_not_found' });
    return res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/match/end  -> updates ended_at / winner_team_id
router.post('/end', async (req, res) => {
  try {
    const { matchId, winnerTeamId = null } = req.body || {};
    if (!matchId) return res.status(400).json({ error: 'matchId_required' });

    const row = await endMatch({ matchId, winnerTeamId });
    return res.json({
      status: 'ended',
      matchId: row.match_id,
      endedAt: row.ended_at,
      winnerTeamId: row.winner_team_id ?? null,
    });
  } catch (e) {
    console.error('[match/end]', e);
    if (e.code === 'match_not_found') return res.status(404).json({ error: 'match_not_found' });
    return res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/match/:id  -> fetch a match row (debug helper)
router.get('/:id', async (req, res) => {
  try {
    const row = await getMatchById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.json(row);
  } catch (e) {
    console.error('[match/:id]', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

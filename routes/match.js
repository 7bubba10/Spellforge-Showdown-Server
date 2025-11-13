// routes/match.js
const express = require('express');
const router = express.Router();

// sanity ping
router.get('/_ping', (_req, res) => res.json({ ok: true }));

// stub handlers (wire DB later)
router.post('/start', (req, res) => {
  const { roomCode, mapId = null, mode = 'default' } = req.body || {};
  if (!roomCode) return res.status(400).json({ error: 'roomCode_required' });
  return res.status(201).json({
    status: 'started',
    matchId: 1,
    lobbyId: 1,
    startedAt: new Date().toISOString(),
    mode,
    mapId,
  });
});

router.post('/end', (req, res) => {
  const { matchId, winnerTeamId = null } = req.body || {};
  if (!matchId) return res.status(400).json({ error: 'matchId_required' });
  return res.json({
    status: 'ended',
    matchId,
    endedAt: new Date().toISOString(),
    winnerTeamId,
  });
});

module.exports = router;

// routes/lobbies.js
const express = require('express');
const router = express.Router();

// DB helpers (single, consolidated import)
const {
  createLobbyRecord,
  getLobbyByCode,
  listLobbies,
} = require('../src/models/lobbyModel');

const {
  listLobbyMembers,
  addLobbyMember,
} = require('../src/models/lobbyMemberModel');

// const { LobbyCreateSchema, LobbyJoinSchema } = require('../src/schemas');

/* -------------------- existing routes -------------------- */

// POST /api/lobbies/create
router.post('/create', async (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  console.log(`[Lobby] Created New Room: ${roomCode}`);

  try {
    await createLobbyRecord(roomCode);
  } catch (e) {
    console.warn('[Lobby] DB insert failed for create (allowing):', e.message);
  }

  return res.json({ status: 'Created', roomCode });
});

// POST /api/lobbies/join
router.post('/join', async (req, res) => {
  const { roomCode } = req.body || {};
  if (!roomCode) {
    console.log('[Lobby] Failed to join: Missing Code');
    return res.status(400).json({ error: 'Room Code Required' });
  }

  try {
    const row = await getLobbyByCode(roomCode);
    if (!row) {
      console.warn('[Lobby] join: code not found in DB (allowing anyway):', roomCode);
    }
  } catch (e) {
    console.warn('[Lobby] join: DB lookup failed (allowing anyway):', e.message);
  }

  console.log(`[Lobby] Joined Room: ${roomCode}`);
  return res.json({ status: 'Joined', roomCode });
});

/* -------------------- new DB-backed routes -------------------- */

// POST /api/lobbies/join/db  { roomCode, name }
router.post('/join/db', async (req, res) => {
  try {
    const { roomCode, name = 'Guest' } = req.body || {};
    if (!roomCode) return res.status(400).json({ error: 'roomCode_required' });

    const lobby = await getLobbyByCode(roomCode);
    if (!lobby) return res.status(404).json({ error: 'lobby_not_found' });

    const member = await addLobbyMember({ lobbyId: lobby.lobby_id, userName: name });
    return res.json({ status: 'joined', lobbyId: lobby.lobby_id, member });
  } catch (e) {
    console.error('[lobbies/join/db]', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/lobbies/list  (mock)
router.get('/list', (_req, res) => {
  console.log('[Server] /api/lobbies/list hit');
  const mockLobbies = [
    { roomCode: 'TEST123', players: 1 },
    { roomCode: 'XYZ789', players: 2 },
  ];
  console.log('[Lobby] Sent Lobby List', mockLobbies);
  return res.json({ status: 'ok', lobbies: mockLobbies });
});

// GET /api/lobbies/list/db  (real from DB)
router.get('/list/db', async (_req, res) => {
  console.log('[Server] /api/lobbies/list/db hit');
  try {
    const rows = await listLobbies();
    console.log('[Lobby] Sent Lobby DB List', rows.length);
    return res.json({
      status: 'ok',
      lobbies: rows.map(r => ({
        roomCode: r.lobby_code,
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    console.log('[Lobby] Error sending DB list:', e.message);
    return res.status(500).json({ error: 'db_list_failed' });
  }
});

// GET /api/lobbies/:code/roster/db
router.get('/:code/roster/db', async (req, res) => {
  try {
    const lobby = await getLobbyByCode(req.params.code);
    if (!lobby) return res.status(404).json({ error: 'lobby_not_found' });
    const roster = await listLobbyMembers(lobby.lobby_id);
    return res.json({ lobbyId: lobby.lobby_id, roster });
  } catch (e) {
    console.error('[lobbies/roster/db]', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

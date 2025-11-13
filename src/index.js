// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server: IOServer } = require('socket.io');
const path = require('path');

const { pool } = require('./db');
const { createMatchByLobbyCode } = require('./models/matchModel');

// --- Routes (force exact files to avoid shadowing) ---
const lobbyRoutes = require('../routes/lobbies');
const matchRoutes = require(path.join(__dirname, '..', 'routes', 'match.js'));

// ── Tunables ─────────────────────────────────────────────
const TICK_HZ = 10;                 // server tick frequency
const COUNTDOWN_SECONDS = 10;       // how long the ready countdown lasts
// ────────────────────────────────────────────────────────

// Schemas & room helpers
const {
  PingSchema,
  LobbyCreateSchema,
  LobbyJoinSchema,
  SetReadySchema,
} = require('./schemas');
const { createRoom, getRoom, removeRoomIfEmpty } = require('./rooms');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount routes
app.use('/api/lobbies', lobbyRoutes);
const matchRouter = express.Router();
matchRouter.get('/_ping', (_req, res) => res.json({ ok: true }));
matchRouter.post('/start', (req, res) => {
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
matchRouter.post('/end', (req, res) => {
  const { matchId, winnerTeamId = null } = req.body || {};
  if (!matchId) return res.status(400).json({ error: 'matchId_required' });
  return res.json({ status: 'ended', matchId, endedAt: new Date().toISOString(), winnerTeamId });
});
app.use('/api/match', matchRouter);
app.use('/api/match', matchRoutes);

// Sanity routes
app.get('/', (_req, res) => res.send('Hello World'));
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/health/db', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: r.rows[0].ok === 1 });
  } catch (e) {
    console.error('[db] healthcheck failed:', e.message);
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

// HTTP server
const PORT = process.env.PORT ? Number(process.env.PORT) : 3003;
const httpServer = app.listen(PORT, () => {
  console.log(`[http] listening on http://localhost:${PORT}`);
});

// Socket.io + gameplay namespace
const io = new IOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
const game = io.of('/game');

/* ----------------------- helpers ----------------------- */

// Broadcast current roster to everyone in a room
function broadcastRoster(code) {
  const room = getRoom(code);
  if (!room) return;
  game.to(`match:${code}`).emit('lobby:players', {
    players: Array.from(room.players.values()),
    state: room.state,
  });
}

// Keep room.state.teams {t0,t1} accurate
function recomputeTeamCounts(room) {
  let t0 = 0, t1 = 0;
  for (const p of room.players.values()) {
    if (p.team === 0) t0++; else t1++;
  }
  room.state.teams = { t0, t1 };
}

// --- readiness helpers ---
function allReady(room) {
  // for now: start when at least 2 players, and everyone is ready
  if (room.players.size < 2) return false;
  for (const p of room.players.values()) {
    if (!p.ready) return false;
  }
  return true;
}

function maybeStartMatch(room) {
  // only from lobby → countdown
  if (room.state.phase !== 'lobby') return;
  if (!allReady(room)) return;

  room.state.phase = 'countdown';
  room.state.countdown = COUNTDOWN_SECONDS * TICK_HZ;
  game.to(`match:${room.code}`).emit('state:update', room.state);
}

// 10 Hz room tick that emits { t } and full state
const roomTimers = new Map(); // code -> setInterval handle
function startTick(code) {
  if (roomTimers.has(code)) return;
  const handle = setInterval(async () => {
    const room = getRoom(code);
    if (!room) return;

    // advance server-side state (demo)
    room.state.tick += 1;

    // -------- countdown / phase logic --------
    if (room.state.phase === 'countdown') {
      // if readiness breaks during countdown, revert to lobby
      if (!allReady(room)) {
        room.state.phase = 'lobby';
        room.state.countdown = 0;
      } else {
        room.state.countdown = Math.max(0, room.state.countdown - 1);
        if (room.state.countdown === 0) {
          room.state.phase = 'match';

          // Create a DB match row the moment we start
          if (!room.matchId) {
            try {
              const row = await createMatchByLobbyCode({ code: room.code, mode: 'prototype' });
              room.matchId = row.match_id;
              console.log('[match] started:', { code: room.code, matchId: room.matchId });
            } catch (e) {
              console.error('[match] failed to create DB row on start:', e.message);
            }
          }
        }
      }
    }

    // demo: slowly fill the capture point
    const p = room.state.point.progress;
    room.state.point.progress = Math.min(100, p + 1);

    // broadcast
    game.to(`match:${code}`).emit('tick', { t: room.state.tick });
    game.to(`match:${code}`).emit('state:update', room.state);
  }, 1000 / TICK_HZ); // Tick rate
  roomTimers.set(code, handle);
}

function stopTickIfEmpty(code) {
  const room = getRoom(code);
  if (!room || room.players.size === 0) {
    const h = roomTimers.get(code);
    if (h) {
      clearInterval(h);
      roomTimers.delete(code);
    }
  }
}

/* -------------------- connection flow ------------------- */

game.on('connection', (socket) => {
  console.log(`[ws] connected: ${socket.id}`);

  // ---- Ping/echo with validation ----
  socket.on('ping:client', (payload) => {
    const parsed = PingSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error:bad_payload', { event: 'ping:client', issues: parsed.error.issues });
      return;
    }
    socket.emit('ping:server', { got: parsed.data, ts: Date.now() });
  });

  // ---- Create lobby (host spawns team 0) ----
  socket.on('lobby:create', (payload) => {
    const parsed = LobbyCreateSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error:bad_payload', { event: 'lobby:create', issues: parsed.error.issues });
      return;
    }

    const room = createRoom();
    const player = { id: socket.id, name: parsed.data.hostName, team: 0, ready: false };

    room.players.set(socket.id, player);
    socket.join(`match:${room.code}`);
    socket.data.roomCode = room.code;

    recomputeTeamCounts(room);
    socket.emit('lobby:created', { code: room.code, you: player });
    broadcastRoster(room.code);
    startTick(room.code);
  });

  // ---- Join lobby (enforce 2v2 cap, balance teams) ----
  socket.on('lobby:join', (payload) => {
    const parsed = LobbyJoinSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error:bad_payload', { event: 'lobby:join', issues: parsed.error.issues });
      return;
    }

    const room = getRoom(parsed.data.code);
    if (!room) {
      socket.emit('error:not_found', { what: 'room', code: parsed.data.code });
      return;
    }

    // no late joins once match has started
    if (room.state.phase !== 'lobby') {
      socket.emit('error:started', { code: room.code, phase: room.state.phase });
      return;
    }

    // Capacity check (2v2 => max 4 total)
    if (room.players.size >= room.maxPlayers) {
      socket.emit('error:full', { code: room.code, max: room.maxPlayers });
      return;
    }

    // Count current players per team
    const counts = { t0: 0, t1: 0 };
    for (const p of room.players.values()) (p.team === 0 ? counts.t0++ : counts.t1++);

    const TEAM_CAP = 2;

    // balanced choice
    let team = counts.t0 <= counts.t1 ? 0 : 1;

    // enforce per-team cap (2)
    if (team === 0 && counts.t0 >= TEAM_CAP) {
      if (counts.t1 >= TEAM_CAP) {
        socket.emit('error:full', { code: room.code, max: room.maxPlayers });
        return;
      }
      team = 1;
    } else if (team === 1 && counts.t1 >= TEAM_CAP) {
      if (counts.t0 >= TEAM_CAP) {
        socket.emit('error:full', { code: room.code, max: room.maxPlayers });
        return;
      }
      team = 0;
    }

    const player = { id: socket.id, name: parsed.data.name, team, ready: false };
    room.players.set(socket.id, player);

    socket.join(`match:${room.code}`);
    socket.data.roomCode = room.code;

    // update counts + notify everyone
    recomputeTeamCounts(room);
    socket.emit('lobby:joined', { code: room.code, you: player });
    broadcastRoster(room.code);

    // may auto-start countdown if everyone’s ready
    maybeStartMatch(room);
  });

  // ---- Set ready flag (host or guest) ----
  socket.on('lobby:setReady', (payload) => {
    const parsed = SetReadySchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error:bad_payload', { event: 'lobby:setReady', issues: parsed.error.issues });
      return;
    }

    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const p = room.players.get(socket.id);
    if (!p) return;

    p.ready = !!parsed.data.ready;

    broadcastRoster(room.code);
    maybeStartMatch(room);
  });

  // ---- Cleanup on disconnect ----
  socket.on('disconnect', (reason) => {
    const code = socket.data.roomCode;
    if (!code) {
      console.log(`[ws] disconnected: ${socket.id} (${reason})`);
      return;
    }

    const room = getRoom(code);
    if (room) {
      room.players.delete(socket.id);
      recomputeTeamCounts(room);
      broadcastRoster(code);
      // if countdown is running and now not all ready, cancel
      if (room.state.phase === 'countdown' && !allReady(room)) {
        room.state.phase = 'lobby';
        room.state.countdown = 0;
        game.to(`match:${code}`).emit('state:update', room.state);
      }

      removeRoomIfEmpty(code);
      stopTickIfEmpty(code);
    }

    console.log(`[ws] disconnected: ${socket.id} (${reason})`);
  });
});

module.exports = { app, httpServer };

// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server: IOServer } = require('socket.io');

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

// Sanity routes
app.get('/', (_req, res) => res.send('Hello World'));
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

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

// Broadcast current roster (and state, if you want) to everyone in a room
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
  // 3 seconds at 10 Hz tick = 30 ticks
  room.state.countdown = 30;
  game.to(`match:${room.code}`).emit('state:update', room.state);
}

// 10 Hz room tick that emits { t } and full state
const roomTimers = new Map(); // code -> setInterval handle
function startTick(code) {
  if (roomTimers.has(code)) return;
  const handle = setInterval(() => {
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
        }
      }
    }

    // demo: slowly fill the capture point (
    const p = room.state.point.progress;
    room.state.point.progress = Math.min(100, p + 1);

    // broadcast
    game.to(`match:${code}`).emit('tick', { t: room.state.tick });
    game.to(`match:${code}`).emit('state:update', room.state);
  }, 100); // 10 Hz
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

  // ---- Ping/echo with validation (no state change here) ----
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

    // Capacity check (2v2 => max 4)
    if (room.players.size >= room.maxPlayers) {
      socket.emit('error:full', { code: room.code, max: room.maxPlayers });
      return;
    }

    // Balanced team pick using current counts
    const { t0, t1 } = room.state.teams || { t0: 0, t1: 0 };
    const team = t0 <= t1 ? 0 : 1;

    const player = { id: socket.id, name: parsed.data.name, team, ready: false };
    room.players.set(socket.id, player);
    socket.join(`match:${room.code}`);
    socket.data.roomCode = room.code;

    recomputeTeamCounts(room);
    socket.emit('lobby:joined', { code: room.code, you: player });
    broadcastRoster(room.code);
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

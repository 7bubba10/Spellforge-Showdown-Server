// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server: IOServer } = require('socket.io');

// schemas & room helpers
const { PingSchema, LobbyCreateSchema, LobbyJoinSchema } = require('./schemas');
const { createRoom, getRoom, removeRoomIfEmpty } = require('./rooms');

const app = express();
app.use(cors());
app.use(express.json());

// simple sanity routes
app.get('/', (_req, res) => { res.send('Hello World'); });
app.get('/health', (_req, res) => { res.json({ ok: true, ts: Date.now() }); });

// http server
const PORT = process.env.PORT ? Number(process.env.PORT) : 3003;
const httpServer = app.listen(PORT, () => {
  console.log(`[http] listening on http://localhost:${PORT}`);
});

// socket.io on same port + gameplay namespace
const io = new IOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
const game = io.of('/game');

/* ----------------------- helpers ----------------------- */

// broadcast current roster to everyone in a room
function broadcastRoster(code) {
  const room = getRoom(code);
  if (!room) return;
  game.to(`match:${code}`).emit('lobby:players', {
    players: Array.from(room.players.values()),
  });
}

// 10 Hz room tick that emits { t } to that room
const roomTimers = new Map(); // code -> setInterval handle
function startTick(code) {
  if (roomTimers.has(code)) return;
  let t = 0;
  const handle = setInterval(() => {
    game.to(`match:${code}`).emit('tick', { t });
    t++;
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

  // ---- ping/echo (with validation) ----
  socket.on('ping:client', (payload) => {
    const parsed = PingSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error:bad_payload', { event: 'ping:client', issues: parsed.error.issues });
      return;
    }
    socket.emit('ping:server', { got: parsed.data, ts: Date.now() });
  });

  // ---- create lobby ----
  socket.on('lobby:create', (payload) => {
    const parsed = LobbyCreateSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error:bad_payload', { event: 'lobby:create', issues: parsed.error.issues });
      return;
    }

    const room = createRoom();
    const player = { id: socket.id, name: parsed.data.hostName, team: 0 };

    room.players.set(socket.id, player);
    socket.join(`match:${room.code}`);
    socket.data.roomCode = room.code;

    socket.emit('lobby:created', { code: room.code, you: player });
    broadcastRoster(room.code);
    startTick(room.code);
  });

  // ---- join lobby ----
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

    // simple team balance
    const counts = { t0: 0, t1: 0 };
    for (const p of room.players.values()) (p.team === 0 ? counts.t0++ : counts.t1++);
    const team = counts.t0 <= counts.t1 ? 0 : 1;

    const player = { id: socket.id, name: parsed.data.name, team };
    room.players.set(socket.id, player);

    socket.join(`match:${room.code}`);
    socket.data.roomCode = room.code;

    socket.emit('lobby:joined', { code: room.code, you: player });
    broadcastRoster(room.code);
  });

  // ---- cleanup on disconnect ----
  socket.on('disconnect', (reason) => {
    const code = socket.data.roomCode;
    if (!code) {
      console.log(`[ws] disconnected: ${socket.id} (${reason})`);
      return;
    }

    const room = getRoom(code);
    if (room) {
      room.players.delete(socket.id);
      broadcastRoster(code);
      removeRoomIfEmpty(code);
      stopTickIfEmpty(code);
    }

    console.log(`[ws] disconnected: ${socket.id} (${reason})`);
  });
});

module.exports = { app, httpServer };

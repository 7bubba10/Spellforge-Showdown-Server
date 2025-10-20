require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { date } = require('zod');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/',(_req,res) =>{
  res.send("Hello World");
});

app.get('/health',(_req,res) =>{
    res.json({ok: true, ts: Date.now()});
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3003;
const httpServer = app.listen(PORT, () => {
    console.log(`[http] listening on http://localhost:${PORT}`);
});

// Websockets
const { Server: IOServer } = require('socket.io');

const io = new IOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// keep gameplay traffic organized in a namespace
const game = io.of('/game');

game.on('connection', (socket) => {
  console.log(`[ws] connected: ${socket.id}`);

  // tiny echo to prove the pipe
  socket.on('ping:client', (payload) => {
    socket.emit('ping:server', { got: payload, ts: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[ws] disconnected: ${socket.id} (${reason})`);
  });
});

module.exports = {app, httpServer};


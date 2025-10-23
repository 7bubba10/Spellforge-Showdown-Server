const { io } = require('socket.io-client');

const socket = io('http://localhost:3003/game', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('[creator] connected as', socket.id);
  socket.emit('lobby:create', { hostName: 'Aidan' });
});

socket.on('lobby:created', (msg) => {
  console.log('[creator] lobby:created', msg);
  console.log(`[creator] Share this code with your friend: ${msg.code}`);
  // Stay connected so the room stays alive
});

socket.on('lobby:players', (roster) => {
  console.log('[creator] roster', roster);
});

socket.on('state:update', (state) => {
  console.log('[creator] state', state);
});


socket.on('error:bad_payload', (e) => console.log('[creator] bad payload', e));
socket.on('error:not_found', (e) => console.log('[creator] not found', e));
socket.on('disconnect', (reason) => console.log('[creator] disconnected', reason));
socket.on('tick', (msg) => console.log('[creator] tick', msg));
socket.on('lobby:players', (r) => console.log('[creator] roster', r));
socket.on('state:update', (s) => console.log('[creator] state', s.state?.teams || s.teams || s));


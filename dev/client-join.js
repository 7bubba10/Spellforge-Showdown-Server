const { io } = require('socket.io-client');
const socket = io('http://localhost:3003/game', { transports: ['websocket'] });

// pass the code as: node dev/client-join.js ABCD
const CODE = process.argv[2];
if (!CODE) {
  console.log('Usage: node dev/client-join.js <ROOM_CODE>');
  process.exit(1);
}

socket.on('connect', () => {
  console.log('[joiner] connected as', socket.id);
  socket.emit('lobby:join', { code: CODE, name: 'Bella' });
});

socket.on('state:update', (state) => {
  console.log('[joiner] state', state);
});

socket.on('lobby:joined', (msg) => {
  console.log('[joiner] lobby:joined', msg);
  socket.emit('lobby:setReady', { ready: true });
});

socket.on('lobby:players', (roster) => console.log('[joiner] roster', roster));
socket.on('error:bad_payload', (e) => console.log('[joiner] bad payload', e));
socket.on('error:not_found', (e) => console.log('[joiner] not found', e));
socket.on('disconnect', (r) => console.log('[joiner] disconnected', r));
socket.on('tick', (msg) => console.log('[joiner] tick', msg));
socket.on('error:full', (e) => console.log('[joiner] room full', e));
socket.on('state:update', (s) => console.log('[joiner] state', s.state?.teams || s.teams || s));



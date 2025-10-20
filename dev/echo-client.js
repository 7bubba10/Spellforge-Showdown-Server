const {io} = require('socket.io-client');

const socket = io('http://localhost:3003/game', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('[client] connected as', socket.id);
  socket.emit('ping:client', { hello: 'server' });
});

socket.on('ping:server', (msg) => {
  console.log('[client] got ping:server', msg);
  socket.close();
});

socket.on('connect_error', (err) => {
  console.error('[client] connect_error', err.message);
});
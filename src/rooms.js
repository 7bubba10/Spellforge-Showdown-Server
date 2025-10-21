const rooms = new Map();          

function makeCode() {
    return Math.random().toString(36).slice(2,6).toUpperCase();
}

function createRoom() {
    const code = makeCode();
    const room = {code, players: new Map()};
    rooms.set(code, room);
    return room;
}

function getRoom(code) {
    return rooms.get(code);
}

function removeRoomIfEmpty(code) {
    const r = rooms.get(code);
    if (r && r.players.size === 0) rooms.delete(code);
}
  
module.exports = { rooms, createRoom, getRoom, removeRoomIfEmpty };
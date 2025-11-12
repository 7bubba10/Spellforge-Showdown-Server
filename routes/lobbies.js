const express = require('express');
const router = express.Router();
//Test
//DB helpers
const {
  createLobbyRecord,
  getLobbyByCode,
  listLobbies
} = require('../src/models/lobbyModel');
const { LobbyCreateSchema, LobbyJoinSchema } = require('../src/schemas'); 


router.post("/create", async (req, res) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log(`[Lobby] Created New Room: ${roomCode} `);

    try {
        await createLobbyRecord(roomCode);
    } catch (e) {
        console.warn('[Lobby] DB insert failed for create (allowing):', e.message);
    }

    return res.json({status: "Created", roomCode});
});

router.post("/join", async (req, res) => {
    const {roomCode} = req.body || {};
    if (!roomCode) {
        console.log(`[Lobby] Failed to join: Missing Code`);
        return res.status(400).json({error: "Room Code Required"});
    }

    try {
        const row = await getLobbyByCode(roomCode);
        if (!row) {
            console.warn('[Lobby] join: code not found in DB (allowing anyway):', roomCode);
    }
  } catch (e) {
    console.warn('[Lobby] join: DB lookup failed (allowing anyway):', e.message);
  }

    console.log(`[Lobby] Joined Room: ${roomCode} `);
    res.json({status: "Joined", roomCode});
});

router.get("/list", (req,res) =>{
    console.log("[Server] /api/lobbies/list hit");
    try
    {
        // Mock rooms for testing well switch later with database intergration 
        const mockLobbies = [
            { roomCode: "TEST123", players: 1 },
            { roomCode: "XYZ789", players: 2 },
        ];

        console.log("[Lobby] Sent Lobby List", mockLobbies);
        res.json({status: "ok", lobbies: mockLobbies});
    }
    catch(err)
    {
        if(!mockLobbies){
            console.log("[Lobby] Error sending list:", err);
            res.status(500).json({error: "Failed to fetch lobby list"});
        }

    }
});
//DB-backed list
router.get("/list/db", async (_req, res) => {
  console.log("[Server] /api/lobbies/list/db hit");
  try {
    const rows = await listLobbies();
    console.log("[Lobby] Sent Lobby DB List", rows.length);
    return res.json({
      status: "ok",
      lobbies: rows.map(r => ({
        roomCode: r.lobby_code,
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    console.log("[Lobby] Error sending DB list:", e.message);
    return res.status(500).json({ error: "db_list_failed" });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();

router.post("/create", (req, res) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log(`[Lobby] Created New Room: ${roomCode} `);
    res.json({status: "Created", roomCode});
});

router.post("/join", (req, res) => {
    const {roomCode} = req.body || {};
    if (!roomCode) {
        console.log(`[Lobby] Failed to join: Missing Code`);
        return res.status(400).json({error: "Room Code Required"});
    }
    console.log(`[Lobby] Joined Room: ${roomCode} `);
    res.json({status: "Joined", roomCode});
});

router.get("/list", (req,res) =>{
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

module.exports = router;
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
    console.log(`[Lobby] Joined Room: ${roomCode} `)
    res.json({status: "Joined", roomCode});
});

module.exports = router;
const express = require('express');
const router = express.Router();

router.post("/create", (req, res) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    res.json({status: "Created", roomCode});
});

router.post("/join", (req, res) => {
    const {roomCode} = req.body;
    if (!roomCode) res.status(400).json({error: "Room Code Required"});
    res.json({status: "Joined", roomCode});
});

export default router;
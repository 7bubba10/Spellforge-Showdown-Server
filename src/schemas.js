const { z } = require('zod');

const PingSchema = z.object({
    hello: z.string()
});

const LobbyCreateSchema = z.object({
    hostName: z.string().min(1).max(20)
});

const LobbyJoinSchema = z.object({
    code: z.string().min(4).max(6),
    name: z.string().min(1).max(20)
});

const SetReadySchema = z.object({
    ready: z.boolean(),
})
module.exports = { PingSchema, LobbyCreateSchema, LobbyJoinSchema, SetReadySchema};
const {z} = require('zod');

const PingSchema = z.object({
    hello: z.string()
});

module.exports = {PingSchema};
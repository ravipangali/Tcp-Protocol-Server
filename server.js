const net = require('net')
const GT06Decoder = require('./gt06_decoder')

const HOST = '0.0.0.0'
const PORT = 5000

const server = net.createServer(
    (socket) => {

        const clientId = `${socket.remoteAddress}:${socket.remotePort}`
        const gt06Decoder = new GT06Decoder();
        console.log(`📲 Client Connected: ${clientId}`)


        socket.on('data', (data) => {
            console.log(`📨 Received data from ${clientId}: ${data.toString('hex').toUpperCase()}`);
            const packets = gt06Decoder.addData(data)
        })


        socket.on('close', () => {
            console.log(`📱 Client disconnected: ${clientId}`);
        })


        socket.on('error', (err) => {
            console.error(`❌ Socket error for ${clientId}:`, err);
        })

    }
)

server.listen(PORT, HOST, () => {
    console.log(`🎯 TCP Server started on ${HOST}:${PORT}`);
})
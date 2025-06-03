class GT06Decoder {

    constructor() {
        this.buffer = Buffer.alloc(0)

        // GT06 protocol supports both start bit patterns
        this.START_BITS_78 = [0x78, 0x78]  // Standard packets
        this.START_BITS_79 = [0x79, 0x79]  // Extended packets
        this.STOP_BITS = [0x0D, 0x0A]

        this.PROTOCOL_NUMBERS = {
            0x01: 'LOGIN',
            0x12: 'GPS_LBS_STATUS',
            0x13: 'STATUS_INFO',
            0x15: 'STRING_INFO',
            0x16: 'ALARM_DATA',
            0x1A: 'GPS_LBS_DATA',
        }

        // Response commands that require acknowledgment
        this.RESPONSE_REQUIRED = [0x01, 0x21, 0x15, 0x16, 0x18, 0x19]
    }


    addData(data) {
        this.buffer = Buffer.concat([this.buffer, data])
        return this.processBuffer()
    }

    
    processBuffer() {
        const packets = []

        console.log(Buffer);
        
    }
}

module.exports = GT06Decoder
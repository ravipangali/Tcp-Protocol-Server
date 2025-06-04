const moment = require('moment');

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
            0xA0: 'GPS_LBS_STATUS_A0',
        }

        // Response commands that require acknowledgment
        this.RESPONSE_REQUIRED = [0x01, 0x21, 0x15, 0x16, 0x18, 0x19]
    }


    addData(data) {
        this.clearBuffer()
        this.buffer = Buffer.concat([this.buffer, data])
        return this.processBuffer()
    }

    clearBuffer() {
        this.buffer = Buffer.alloc(0)
    }


    processBuffer() {
        const packets = []

        while (this.buffer.length >= 5) {

            const startInfo = this.findStartBits()

            if (startInfo.index === -1) {
                this.buffer = Buffer.alloc(0)
                break
            }

            if (startInfo.index > 0) {
                this.buffer = this.buffer.slice(startInfo.index)
            }

            if (this.buffer.length < 5) break

            let lengthByte, totalLength
            lengthByte = this.buffer[2]
            totalLength = lengthByte + 5

            if (this.buffer.length < totalLength) break

            const packet = this.buffer.slice(0, totalLength)

            if (packet[totalLength - 2] === 0x0D && packet[totalLength - 1] === 0x0A) {
                try {
                    const decoded = this.decodePacket(packet)
                    if (decoded) {
                        packets.push(decoded)
                    }
                } catch (err) {
                    console.error('Error decoding packet: ', err)
                }
            }

            this.buffer = this.buffer.slice(totalLength)

        }

        return packets

    }


    findStartBits() {
        for (let i = 0; i <= this.buffer.length - 2; i++) {
            // Check for 7878 start bits
            if (this.buffer[i] === 0x78 && this.buffer[i + 1] === 0x78) {
                return { index: i }
            }
            // Check for 7979 start bits (extended packets)
            if (this.buffer[i] === 0x79 && this.buffer[i + 1] === 0x79) {
                return { index: i }
            }
        }
        return { index: -1, isExtended: false }
    }


    decodePacket(packet) {

        if (packet.length < 5) return null

        let protocolOffset, dataStartOffset, serialOffset, checksumOffset
        protocolOffset = 3
        dataStartOffset = 4
        serialOffset = packet.length - 6
        checksumOffset = packet.length - 4

        const result = {
            raw: packet.toString('hex').toUpperCase(),
            timestamp: new Date(),
            length: packet[2],
            protocol: packet[protocolOffset],
            protocolName: this.PROTOCOL_NUMBERS[packet[protocolOffset]] || 'UNKNOWN',
            serialNumber: serialOffset >= 0 ? packet[serialOffset] : 0,
            checksum: checksumOffset >= 0 ? packet[checksumOffset] : 0,
            needsResponse: this.RESPONSE_REQUIRED.includes(packet[protocolOffset]),
        }

        let dataPayload = packet.slice(dataStartOffset, serialOffset)
        console.log('Data Payload :',dataPayload);
        

        switch (packet[protocolOffset]) {
            case 0x01:
                this.decodeLogin(dataPayload, result)
                break
            case 0x12:
                this.decodeGPSLBS(dataPayload, result)
                break
            case 0xA0:
                this.decodeGPSLBS(dataPayload, result)
                break
            case 0x13:
                this.decodeStatusInfo(dataPayload, result)
                break
            case 0x16:
                this.decodeAlarmData(dataPayload, result)
                break
            case 0x1A:
                this.decodeGPSLBSData(dataPayload, result)
                break
            default:
                result.data = dataPayload.toString('hex').toUpperCase();
                break
        }
        return result
    }


    decodeLogin(data, result) {
        if (data.length >= 8) {
            result.terminalId = data.slice(0, 8).toString('hex').toUpperCase();
            result.deviceType = data.length > 8 ? data.readUInt16BE(8) : null;
            result.timezoneOffset = data.length > 10 ? data.readInt16BE(10) : null;
        }
    }

    decodeGPSLBS(data, result) {
        if (data.length < 12) return

        let offset = 0

        if (data.length >= 6) {
            const year = 2000 + data[offset];
            const month = data[offset + 1];
            const day = data[offset + 2];
            const hour = data[offset + 3];
            const minute = data[offset + 4];
            const second = data[offset + 5];
            offset += 6;

            if (year >= 2000 && year <= 2050 && month >= 1 && month <= 12 &&
                day >= 1 && day <= 31 && hour <= 23 && minute <= 59 && second <= 59) {
                result.gpsTime = moment(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`, 'YYYY-MM-DD HH:mm:ss').toDate();
            }
        }

        if (result.protocol === 0xA0) {
            if (offset < data.length) {

                offset += 1

                if (offset + 12 <= data.length) {

                    const latBytes = data.slice(offset, offset + 4);
                    const latRaw = latBytes.readUInt32BE(0);

                    if (latRaw > 0 && latRaw < 0xFFFFFFFF) {
                        result.latitude = latRaw / 1800000.0;
                    }
                    offset += 4;

                    const lngBytes = data.slice(offset, offset + 4);
                    const lngRaw = lngBytes.readUInt32BE(0);

                    if (lngRaw > 0 && lngRaw < 0xFFFFFFFF) {
                        result.longitude = lngRaw / 1800000.0;
                    }
                    offset += 4;

                    if (offset + 3 <= data.length) {
                        result.speed = data[offset];
                        const courseStatus = data.readUInt16BE(offset + 1);
                        result.course = courseStatus & 0x03FF;

                        // Status flags
                        result.gpsRealTime = (courseStatus & 0x2000) === 0;
                        result.gpsPositioned = (courseStatus & 0x1000) === 0;
                        result.eastLongitude = (courseStatus & 0x0800) === 0;
                        result.northLatitude = (courseStatus & 0x0400) === 0;

                        // Adjust coordinates based on hemisphere flags
                        if (result.longitude !== undefined && !result.eastLongitude) {
                            result.longitude = -result.longitude;
                        }
                        if (result.latitude !== undefined && !result.northLatitude) {
                            result.latitude = -result.latitude;
                        }

                        offset += 3;
                    }
                }

                while (offset + 9 <= data.length) {
                    const testMCC = data.readUInt16BE(offset);

                    if (testMCC >= 100 && testMCC <= 999) {
                        result.mcc = testMCC;
                        result.mnc = data[offset + 2];
                        result.lac = data.readUInt16BE(offset + 3);

                        const cellId1 = data[offset + 5];
                        const cellId2 = data[offset + 6];
                        const cellId3 = data[offset + 7];
                        result.cellId = (cellId1 << 16) | (cellId2 << 8) | cellId3;

                        offset += 8;
                        break;
                    }
                    offset += 1;
                }
            }
        } else {
            if (offset < data.length) {

                const gpsInfoLength = data[offset];
                offset += 1;

                if (gpsInfoLength > 0 && gpsInfoLength <= 50 && offset + gpsInfoLength <= data.length) {

                    if (offset + 4 <= data.length) {
                        result.satellites = (data[offset] >> 4) & 0x0F;

                        const lat1 = data[offset] & 0x0F;
                        const lat2 = data[offset + 1];
                        const lat3 = data[offset + 2];
                        const lat4 = data[offset + 3];

                        const latRaw = (lat1 << 24) | (lat2 << 16) | (lat3 << 8) | lat4;

                        if (latRaw > 0) {
                            result.latitude = latRaw / 1800000.0;
                        }
                        offset += 4;
                    }

                    if (offset + 4 <= data.length) {
                        const lngRaw = data.readUInt32BE(offset);

                        if (lngRaw > 0) {
                            result.longitude = lngRaw / 1800000.0;
                        }
                        offset += 4;
                    }

                    if (offset < data.length) {
                        result.speed = data[offset];
                        offset += 1;
                    }

                    if (offset + 2 <= data.length) {
                        const courseStatus = data.readUInt16BE(offset);

                        result.course = courseStatus & 0x03FF;
                        result.gpsRealTime = (courseStatus & 0x2000) === 0;
                        result.gpsPositioned = (courseStatus & 0x1000) === 0;
                        result.eastLongitude = (courseStatus & 0x0800) === 0;
                        result.northLatitude = (courseStatus & 0x0400) === 0;

                        offset += 2;

                        // Adjust coordinates
                        if (result.longitude !== undefined && !result.eastLongitude) {
                            result.longitude = -result.longitude;
                        }
                        if (result.latitude !== undefined && !result.northLatitude) {
                            result.latitude = -result.latitude;
                        }
                    }

                }
            }

            if (offset + 9 <= data.length) {
                result.mcc = data.readUInt16BE(offset);
                result.mnc = data[offset + 2];
                result.lac = data.readUInt16BE(offset + 3);

                const cellId1 = data[offset + 5];
                const cellId2 = data[offset + 6];
                const cellId3 = data[offset + 7];
                result.cellId = (cellId1 << 16) | (cellId2 << 8) | cellId3;

                offset += 8;
            }
        }

        if (data.length > offset) {
            result.additionalData = data.slice(offset).toString('hex').toUpperCase();
        }
    }


    decodeStatusInfo(data, result) {
        
        console.log(data[1]);
        

        // if (data.length >= 1) {
        //     const status = data[0];
        //     result.terminalInfo = {
        //         oilElectricity: (status & 0x01) !== 0,
        //         gpsTracking: (status & 0x02) !== 0,
        //         charging: (status & 0x04) !== 0,
        //         accHigh: (status & 0x08) !== 0,
        //         defence: (status & 0x10) !== 0,
        //         lowBattery: (status & 0x20) !== 0,
        //         gsmSignal: (status >> 6) & 0x03
        //     };
        // }

        // if (data.length >= 3) {
        //     result.voltage = data[1]; // Convert to volts
        // }

        // if (data.length >= 4) {
        //     result.gsmSignalStrength = data[3];
        // }

        // if (data.length >= 6) {
        //     result.alarmLanguage = data[4];
        // }
    }


    decodeAlarmData(data, result) {
        if (data.length >= 1) {
            const alarmType = data[0];
            result.alarmType = {
                emergency: (alarmType & 0x01) !== 0,
                overspeed: (alarmType & 0x02) !== 0,
                lowPower: (alarmType & 0x04) !== 0,
                shock: (alarmType & 0x08) !== 0,
                intoArea: (alarmType & 0x10) !== 0,
                outArea: (alarmType & 0x20) !== 0,
                longNoOperation: (alarmType & 0x40) !== 0,
                distance: (alarmType & 0x80) !== 0
            };
        }

        // Decode GPS data if present
        if (data.length > 1) {
            this.decodeGPSLBS(data.slice(1), result);
        }
    }


    decodeGPSLBSData(data, result) {
        this.decodeGPSLBS(data, result);
    }

    generateResponse(serialNumber, protocolNumber) {
        const response = Buffer.alloc(10);
        let offset = 0;

        // Start bits
        response[offset++] = 0x78;
        response[offset++] = 0x78;

        // Length
        response[offset++] = 0x05;

        // Protocol number
        response[offset++] = protocolNumber;

        // Serial number
        response.writeUInt16BE(serialNumber, offset);
        offset += 2;

        // CRC (simplified - in real implementation should calculate proper CRC)
        const crc = this.calculateCRC(response.slice(2, offset));
        response.writeUInt16BE(crc, offset);
        offset += 2;

        // Stop bits
        response[offset++] = 0x0D;
        response[offset++] = 0x0A;

        return response;
    }

    /**
     * Calculate CRC for packet (simplified implementation)
     */
    calculateCRC(data) {
        let crc = 0xFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                if (crc & 1) {
                    crc = (crc >> 1) ^ 0x8408;
                } else {
                    crc >>= 1;
                }
            }
        }
        return (~crc) & 0xFFFF;
    }
}

module.exports = GT06Decoder
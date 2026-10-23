require("dotenv").config();
const {pool} = require("./db")
const mqtt = require("mqtt");
const client = mqtt.connect(process.env.MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 2000
});

const ACTION_TIMEOUT_SECONDS = 10;

// hàm cập nhật status TIMEOUT
async function markTimedOutActions() {
    const result = await pool.query(
        `UPDATE actions
         SET responded_at = NOW(),
             response_time_ms = ROUND(
                 EXTRACT(EPOCH FROM (NOW() - requested_at)) * 1000
             )::INTEGER,
             message = 'TIMEOUT'
         WHERE message = 'PENDING'
           AND requested_at <= NOW() - make_interval(secs => $1::integer)`,
        [ACTION_TIMEOUT_SECONDS]
    );

    if (result.rowCount > 0) {
        console.log(`Timed out ${result.rowCount} action(s)`);
    }
}

async function saveTelemetry(topic, payload) {
    const nodeCode = topic.split("/")[1];
    const db = await pool.connect();

    try {
        await db.query("BEGIN");

        // 1. Tạo hoặc cập nhật ESP8266
        let result = await db.query(
            `SELECT id FROM devices
             WHERE device_code = $1`,
            [nodeCode]
        );

        let nodeId;

        if (result.rowCount === 0) {
            result = await db.query(
                `INSERT INTO devices (
                    device_code,
                    name,
                    type,
                    connection_status,
                    last_seen
                 )
                 VALUES ($1, $2, 'NODE', 'online', NOW())
                 RETURNING id`,
                [nodeCode, `ESP8266 ${nodeCode}`]
            );

            nodeId = result.rows[0].id;
        } else {
            nodeId = result.rows[0].id;

            await db.query(
                `UPDATE devices
                 SET connection_status = 'online',
                     last_seen = NOW()
                 WHERE id = $1`,
                [nodeId]
            );
        }

        // 2. Tạo hoặc cập nhật LED
        if (Array.isArray(payload.devices)) {
            for (const item of payload.devices) {
                const deviceCode = `${nodeCode}:${item.device}`;

                const deviceResult = await db.query(
                    `SELECT id FROM devices
                     WHERE device_code = $1`,
                    [deviceCode]
                );

                if (deviceResult.rowCount === 0) {
                    await db.query(
                        `INSERT INTO devices (
                            device_code,
                            name,
                            type,
                            current_state,
                            connection_status,
                            last_seen
                         )
                         VALUES ($1, $2, 'ACTUATOR', $3, 'online', NOW())`,
                        [
                            deviceCode,
                            item.name || item.device,
                            item.state
                        ]
                    );
                } else {
                    await db.query(
                        `UPDATE devices
                         SET current_state = $2,
                             connection_status = 'online',
                             last_seen = NOW()
                         WHERE device_code = $1`,
                        [deviceCode, item.state]
                    );
                }
            }
        }

        // 3. Tạo sensor và ghi dữ liệu
        const sensorValues = [
            {
                code: `${nodeCode}:temperature`,
                name: "Nhiệt độ",
                type: "TEMPERATURE",
                unit: "°C",
                value: payload.temp
            },
            {
                code: `${nodeCode}:humidity`,
                name: "Độ ẩm",
                type: "HUMIDITY",
                unit: "%",
                value: payload.hum
            },
            {
                code: `${nodeCode}:light`,
                name: "Ánh sáng",
                type: "LIGHT",
                unit: "lux",
                value: payload.light
            }
        ];

        for (const sensor of sensorValues) {
            if (
                sensor.value === undefined ||
                sensor.value === null ||
                !Number.isFinite(Number(sensor.value))
            ) {
                continue;
            }

            let sensorResult = await db.query(
                `SELECT id FROM sensors
                 WHERE sensor_code = $1`,
                [sensor.code]
            );

            let sensorId;

            if (sensorResult.rowCount === 0) {
                sensorResult = await db.query(
                    `INSERT INTO sensors (
                        sensor_code,
                        name,
                        type,
                        unit,
                        devices_id
                     )
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [
                        sensor.code,
                        sensor.name,
                        sensor.type,
                        sensor.unit,
                        nodeId
                    ]
                );

                sensorId = sensorResult.rows[0].id;
            } else {
                sensorId = sensorResult.rows[0].id;

                await db.query(
                    `UPDATE sensors
                     SET unit = $2
                     WHERE id = $1`,
                    [sensorId, sensor.unit]
                );
            }

            await db.query(
                `INSERT INTO sensor_data (
                    value,
                    recorded_at,
                    sensor_id
                 )
                 VALUES ($1, NOW(), $2)`,
                [Number(sensor.value), sensorId]
            );
        }

        await db.query("COMMIT");
        console.log(`Đã lưu telemetry của ${nodeCode}`);
    } catch (error) {
        await db.query("ROLLBACK");
        throw error;
    } finally {
        db.release();
    }
}

// điều khiển LED
function publishDeviceCommand(nodeCode, deviceCode, action, requestId) {
    if (!client.connected) {
        return Promise.reject(
            new Error("Backend chưa kết nối MQTT")
        );
    }

    const topic = `iot/${nodeCode}/led/set`;

    const payload = JSON.stringify({
        device: deviceCode,
        action,
        requestId
    });

    return new Promise((resolve, reject) => {
        client.publish(topic, payload,
            {
                qos: 1,
                retain: false
            },
            error => {
                if (error) {
                    reject(error);
                    return;
                }

                console.log("Đã publish:", topic, payload);
                resolve();
            }
        );
    });
}

async function handleLedStatus(topic, payload) {
    const nodeCode = topic.split("/")[1];
    const db = await pool.connect();

    try {
        await db.query("BEGIN");

        if (Array.isArray(payload.devices)) {
            for (const item of payload.devices) {
                const deviceCode = `${nodeCode}:${item.device}`;

                const state = String(item.state || "").toUpperCase();

                if (!["ON", "OFF"].includes(state)) {
                    continue;
                }

                await db.query(
                    `UPDATE devices
                     SET current_state = $2,
                         connection_status = 'online',
                         last_seen = NOW()
                     WHERE device_code = $1`,
                    [deviceCode, state]
                );
            }
        }

        if (payload.requestId) {
            const reportedStatus = String(payload.status || "").toUpperCase();

            const responseStatus =
                payload.success === false ||
                reportedStatus === "FAILED" ||
                Boolean(payload.error) ? "FAILED" : "SUCCESS";

            await db.query(
                `UPDATE actions
                 SET responded_at = NOW(),
                     response_time_ms = ROUND(
                         EXTRACT(
                             EPOCH FROM (NOW() - requested_at)
                         ) * 1000
                     )::INTEGER,
                     message = $2
                 WHERE request_id = $1
                   AND message = 'PENDING'`,
                [payload.requestId, responseStatus]
            );
        }

        await db.query("COMMIT");
        console.log("Đã cập nhật trạng thái LED");
    } catch (error) {
        await db.query("ROLLBACK");
        throw error;
    } finally {
        db.release();
    }
}

async function handleNodeStatus(topic, message) {
    const nodeCode = topic.split("/")[1];
    const status = message.trim().toLowerCase();

    if (status === "online") {
        await pool.query(
            `UPDATE devices
             SET connection_status = 'online',
                 last_seen = NOW()
             WHERE device_code = $1
                OR device_code LIKE $1 || ':%'`,
            [nodeCode]
        );
    } else {
        await pool.query(
            `UPDATE devices
             SET connection_status = 'offline'
             WHERE device_code = $1
                OR device_code LIKE $1 || ':%'`,
            [nodeCode]
        );
    }

    console.log(`${nodeCode} đang ${status}`);
}


client.on("connect", () => {
    console.log("MQTT connected");
    client.subscribe([
        "iot/esp01/telemetry",
        "iot/esp01/led/status",
        "iot/esp01/status"
    ], error => {
        if(error){
            console.error("Subscribe error:", error);
            return;
        }
        console.log("MQTT subscribed");
    });
});

client.on("message", async (topic, message) => {
    try {
        const text = message.toString();

        console.log("MQTT:", topic, text);

        if (topic.endsWith("/telemetry")) {
            await saveTelemetry(topic, JSON.parse(text));
            return;
        }

        if (topic.endsWith("/led/status")) {
            await handleLedStatus(topic, JSON.parse(text));
            return;
        }

        if (topic.endsWith("/status")) {
            await handleNodeStatus(topic, text);
        }
    } catch (error) {
        console.error("Lỗi xử lý MQTT:", error);
    }
});

client.on("error", error => {
    console.error("MQTT error:", error.message);
});

markTimedOutActions().catch(error => {
    console.error("Timeout check error:", error);
});

const timeoutCheck = setInterval(() => {
    markTimedOutActions().catch(error => {
        console.error("Timeout check error:", error);
    });
}, 1000);

timeoutCheck.unref();

module.exports = {
    client,
    publishDeviceCommand
};

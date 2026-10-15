const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const [sensorResult, deviceResult, nodeResult, chartResult] =
            await Promise.all([
                query(`
                    SELECT DISTINCT ON (s.type)
                        s.sensor_code AS "sensorId",
                        s.name AS "sensorName",
                        s.type,
                        s.unit,
                        d.value,
                        d.recorded_at AS "recordedAt"
                    FROM sensor_data d
                    JOIN sensors s ON s.id = d.sensor_id
                    ORDER BY s.type, d.recorded_at DESC
                `),
                query(`
                    SELECT
                        device_code AS "deviceCode",
                        name,
                        type,
                        current_state AS "currentState",
                        CASE
                            WHEN connection_status = 'online'
                             AND last_seen >= NOW() - INTERVAL '6 seconds'
                            THEN 'online'
                            ELSE 'offline'
                        END AS "connectionStatus",
                        last_seen AS "lastSeen"
                    FROM devices
                    WHERE type = 'ACTUATOR'
                    ORDER BY id
                `),
                query(`
                    SELECT
                        device_code AS "deviceCode",
                        name,
                        CASE
                            WHEN connection_status = 'online'
                             AND last_seen >= NOW() - INTERVAL '6 seconds'
                            THEN 'online'
                            ELSE 'offline'
                        END AS "connectionStatus",
                        last_seen AS "lastSeen"
                    FROM devices
                    WHERE type = 'NODE'
                    ORDER BY id
                    LIMIT 1
                `),
                query(`
                    WITH ranked AS (
                        SELECT
                            s.type,
                            d.value,
                            d.recorded_at,
                            ROW_NUMBER() OVER (
                                PARTITION BY s.type
                                ORDER BY d.recorded_at DESC
                            ) AS row_number
                        FROM sensor_data d
                        JOIN sensors s ON s.id = d.sensor_id
                    )
                    SELECT
                        type,
                        value,
                        recorded_at AS "recordedAt"
                    FROM ranked
                    WHERE row_number <= 30
                    ORDER BY recorded_at ASC, type
                `)
            ]);

        const findSensor = type =>
            sensorResult.rows.find(
                item => item.type === type
            ) || null;

        res.json({
            success: true,
            data: {
                temperature: findSensor("TEMPERATURE"),
                humidity: findSensor("HUMIDITY"),
                light: findSensor("LIGHT"),
                devices: deviceResult.rows,
                node: nodeResult.rows[0] || null,
                chartData: chartResult.rows
            }
        });
    } catch (error) {
        console.error("Lỗi dashboard:", error);

        res.status(500).json({
            success: false,
            message: "Không tải được dashboard"
        });
    }
});

module.exports = router;

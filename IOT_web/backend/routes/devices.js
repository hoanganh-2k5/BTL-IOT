const express = require("express");
const crypto = require("node:crypto");
const { query } = require("../db");
const { publishDeviceCommand } = require("../mqtt");

const router = express.Router();

async function markActionFailed(requestId) {
    if (!requestId) return;

    await query(
        `UPDATE actions
         SET responded_at = NOW(),
             response_time_ms = ROUND(
                 EXTRACT(EPOCH FROM (NOW() - requested_at)) * 1000
             )::INTEGER,
             message = 'FAILED'
         WHERE request_id = $1
           AND message = 'PENDING'`,
        [requestId]
    );
}

router.get("/", async (req, res) => {
    try {
        const result = await query(`
            SELECT
                id,
                device_code AS "deviceCode",
                name,
                type,
                current_state AS "currentState",
                connection_status AS "connectionStatus",
                last_seen AS "lastSeen"
            FROM devices
            WHERE type = 'ACTUATOR'
            ORDER BY id
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post("/:id/actions", async (req, res) => {
    const action =
        String(req.body.action || "").toUpperCase();

    if (!["ON", "OFF"].includes(action)) {
        return res.status(400).json({
            success: false,
            message: "Action phải là ON hoặc OFF"
        });
    }

    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Bạn chưa đăng nhập"
        });
    }

    let requestId = null;

    try {
        const deviceResult = await query(
            `SELECT *
             FROM devices
             WHERE device_code = $1
               AND type = 'ACTUATOR'`,
            [req.params.id]
        );

        if (deviceResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy thiết bị"
            });
        }

        const device = deviceResult.rows[0];
        const separator = device.device_code.indexOf(":");

        if (separator === -1) {
            return res.status(400).json({
                success: false,
                message: "Device code không hợp lệ"
            });
        }

        const nodeCode = device.device_code.slice(0, separator);

        const localDeviceCode = device.device_code.slice(separator + 1);

        requestId = crypto.randomUUID();

        await query(
            `INSERT INTO actions (
                request_id,
                action,
                requested_at,
                message,
                user_id,
                devices_id
             )
             VALUES ($1, $2, NOW(), 'PENDING', $3, $4)`,
            [
                requestId,
                action,
                req.session.user.id,
                device.id
            ]
        );

        await publishDeviceCommand(
            nodeCode,
            localDeviceCode,
            action,
            requestId
        );

        res.status(202).json({
            success: true,
            data: {
                requestId,
                deviceId: device.device_code,
                action,
                message: "PENDING"
            }
        });
    } catch (error) {
        try {
            await markActionFailed(requestId);
        } catch (statusError) {
            console.error("Cannot save FAILED status:", statusError);
        }

        console.error("Lỗi điều khiển:", error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;

const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const requestedLimit = Math.floor(Number(req.query.limit) || 10);
    const limit = [10, 20, 50].includes(requestedLimit) ? requestedLimit : 10;
    const offset = (page - 1) * limit;

    const device = String(req.query.device || "");
    const action = String(req.query.action || "").toUpperCase();
    const status = String(req.query.status || "").toUpperCase();
    const time = String(req.query.time || "").replace(/\D/g, "");

    const conditions = [];
    const params = [];

    if (device) {
        params.push(device);
        conditions.push(
            `d.device_code = $${params.length}`
        );
    }

    if (["ON", "OFF"].includes(action)) {
        params.push(action);
        conditions.push(
            `UPPER(a.action) = $${params.length}`
        );
    }

    if (["SUCCESS", "FAILED", "TIMEOUT", "PENDING"].includes(status)) {
        params.push(status);
        conditions.push(
            `UPPER(COALESCE(a.message, 'PENDING')) = $${params.length}`
        );
    }

    if (time) {
        params.push(`%${time}%`);
        conditions.push(`
            (
                to_char(a.requested_at AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDDHH24MISS') LIKE $${params.length}
                OR to_char(a.responded_at AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDDHH24MISS') LIKE $${params.length}
            )
        `);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const dataParams = [...params, limit, offset];
    const limitPosition = params.length + 1;
    const offsetPosition = params.length + 2;

    try {
        const [actionsResult, countResult] = await Promise.all([
            query(
                `SELECT
                    a.id,
                    a.request_id AS "requestId",
                    u.username AS "username",
                    d.device_code AS "deviceId",
                    d.name AS "deviceName",
                    a.action,
                    COALESCE(a.message, 'PENDING') AS status,
                    a.requested_at AS "requestedAt",
                    a.responded_at AS "respondedAt",
                    a.response_time_ms AS "latencyMs"
                FROM actions a
                JOIN users u ON u.id = a.user_id
                JOIN devices d ON d.id = a.devices_id
                ${whereSql}
                ORDER BY a.requested_at DESC, a.id DESC
                LIMIT $${limitPosition}
                OFFSET $${offsetPosition}`,
                dataParams
            ),
            query(
                `SELECT COUNT(*)::INTEGER AS total
                FROM actions a
                JOIN devices d ON d.id = a.devices_id
                ${whereSql}`,
                params
            )
        ]);

        const totalItems = countResult.rows[0].total;

        res.json({
            success: true,
            data: actionsResult.rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit)
            }
        });
    } catch (error) {
        console.error("Lỗi tải lịch sử:", error);

        res.status(500).json({
            success: false,
            message: "Không tải được lịch sử"
        });
    }
});

module.exports = router;

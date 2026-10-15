const express = require("express");
const {query} = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const requestedLimit = Math.floor(Number(req.query.limit) || 10);
    const limit = [10, 20, 50].includes(requestedLimit) ? requestedLimit : 10;
    const offset = (page - 1) * limit;

    const searchType = String(req.query.searchType || "").toUpperCase();
    const searchQuery = String(req.query.q || "").trim();
    const conditions = [];
    const params = [];

    if (searchQuery && ["TEMPERATURE", "HUMIDITY", "LIGHT"].includes(searchType)) {
        params.push(searchType);
        const typePosition = params.length;
        params.push(`%${searchQuery}%`);
        const queryPosition = params.length;
        const valueExpression = `CASE
            WHEN s.type = 'LIGHT' THEN ROUND(d.value / 1024.0 * 100)::TEXT
            ELSE d.value::TEXT
        END`;
        conditions.push(`
            s.type = $${typePosition}
            AND ${valueExpression} ILIKE $${queryPosition}
        `);
    }

    if (searchQuery && searchType === "TIME") {
        params.push(`%${searchQuery.replace(/\D/g, "")}%`);
        conditions.push(`
            to_char(d.recorded_at AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDDHH24MISS') LIKE $${params.length}
        `);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const dataParams = [...params, limit, offset];
    const limitPosition = params.length + 1;
    const offsetPosition = params.length + 2;

    try {
        const [dataResult, countResult] =
            await Promise.all([
                query(
                    `SELECT
                        d.id,
                        s.sensor_code AS "sensorId",
                        s.name AS "sensorName",
                        s.type,
                        d.value,
                        s.unit,
                        d.recorded_at AS "recordedAt"
                    FROM sensor_data d
                    JOIN sensors s ON s.id = d.sensor_id
                    ${whereSql}
                    ORDER BY d.recorded_at DESC
                    LIMIT $${limitPosition}
                    OFFSET $${offsetPosition}`,
                    dataParams
                ),
                query(
                    `SELECT COUNT(*)::INTEGER AS total
                    FROM sensor_data d
                    JOIN sensors s ON s.id = d.sensor_id
                    ${whereSql}`,
                    params
                )
            ]);

        const totalItems = countResult.rows[0].total;

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit)
            }
        });
    } catch (error) {
        console.error("Lỗi tải dữ liệu cảm biến:", error);

        res.status(500).json({
            success: false,
            message: "Không tải được dữ liệu cảm biến"
        });
    }
});

module.exports = router;

const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
    const {username, password} = req.body;
    try {
        const result = await query(
            `SELECT id, username, password_hash, fullname
             FROM users
             WHERE username = $1`,
            [username]
        );

        if (result.rowCount === 0) {
            return res.status(401).json({
                success: false,
                message: "Sai tên đăng nhập hoặc mật khẩu"
            });
        }

        const user = result.rows[0];

        const passwordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                message: "Sai tên đăng nhập hoặc mật khẩu"
            });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            fullname: user.fullname
        };

        res.json({
            success: true,
            message: "Đăng nhập thành công",
            data: {
                user: req.session.user
            }
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);

        res.status(500).json({
            success: false,
            message: "Không thể đăng nhập"
        });
    }
});

router.use(requireAuth);

router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if(err){
            return res.status(500).json({
                success: false,
                message: "Đăng xuất thất bại"
            });
        }

        res.clearCookie("connect.sid");

        return res.json({
            success: true,
            message: "Đăng xuất thành công"
        });
    });
});

router.get("/me", (req, res) => {
    if(!req.session.user){
        return res.status(401).json({
            success: false
        });
    }

    return res.json({
        success: true,
        data: {user: req.session.user}
    });
});

module.exports = router;

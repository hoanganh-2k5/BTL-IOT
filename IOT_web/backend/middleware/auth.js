function requireAuth(req, res, next) {
    if (!req.session?.user) {
        return res.status(401).json({
            success: false,
            message: "Bạn chưa đăng nhập"
        });
    }

    next();
}

module.exports = { requireAuth };

require("dotenv").config();
require("./mqtt");
const express = require("express");
const session = require("express-session")
const path = require("node:path");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const sensorDataRoutes = require("./routes/sensor-data");
const deviceRoutes = require("./routes/devices");
const actionRoutes = require("./routes/actions-history");

const app = express()
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(session({
    secret: "iot-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false
    }
}));

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/sensor-data", sensorDataRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/actions", actionRoutes);

app.use(
    express.static(
        path.join(__dirname, "../frontend")
    )
);

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
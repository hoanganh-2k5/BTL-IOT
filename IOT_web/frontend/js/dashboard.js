setTimeout(() => {
    if (sessionStorage.getItem("loginsuccess") === "true") {
        alert("Đăng nhập thành công");
        sessionStorage.removeItem("loginsuccess");
    }
}, 300);

// Xử lý side bar
const pages = document.querySelectorAll(".nav-btn");
const paths = [
    "/dashboard.html",
    "/datasensor.html",
    "/action-history.html",
    "/profile.html"
];

pages.forEach((page, index) => {
    page.onclick = () => {
        if (window.location.pathname !== paths[index]) {
            window.location.href = paths[index];
        }
    };
});

// hiển thị phần trăm biến
const deviceGrid = document.getElementById("deviceGrid");
const sensorFilter = document.getElementById("sensorFilter");
const pendingCommands = new Map();
const PENDING_TIMEOUT_MS = 10000;
let dashboardLoading = false;
let sensorChart = null;

function updateSensor(sensor, valueId, timeId, barId, max) {
    const valueElement = document.getElementById(valueId);
    const timeElement = document.getElementById(timeId);
    const barElement = document.getElementById(barId);

    if (!sensor) {
        valueElement.textContent = "--";
        timeElement.textContent = "--";
        barElement.style.width = "0%";
        return;
    }

    const value = Number(sensor.value);
    if (max === 1024){
        valueElement.textContent = Math.round(value /1024 * 100);
    }
    else{
        valueElement.textContent = value;
    }
    timeElement.textContent = new Date(sensor.recordedAt).toLocaleTimeString("vi-VN");
    barElement.style.width = `${Math.min(100, Math.max(0, value / max * 100))}%`;   
}

// hiển thị nút thiết bị
function renderDevices(devices) {
    deviceGrid.innerHTML = devices.map(device => {
        const state = String(device.currentState || "UNKNOWN").toUpperCase();
        const online = device.connectionStatus === "online";
        const pending = pendingCommands.get(device.deviceCode);

        if (pending && state === pending.action) {
            pendingCommands.delete(device.deviceCode);
        } else if (
            pending &&
            Date.now() - pending.startedAt >= PENDING_TIMEOUT_MS
        ) {
            pendingCommands.delete(device.deviceCode);
        }

        const isPending = pendingCommands.has(device.deviceCode);
        const displayState = isPending ? "PENDING" : state;

        return `
            <article
                class="device-card"
                data-device-id="${device.deviceCode}"
                data-current-state="${state}"
                data-status="${online ? "online" : "offline"}">

                <div class="device-card-top">
                    <div>
                        <h3>${device.name}</h3>
                        <p>${device.deviceCode}</p>
                    </div>

                    <span class="badge ${
                        online ? "badge-online" : "badge-offline"
                    }">
                        ${online ? "ONLINE" : "OFFLINE"}
                    </span>
                </div>

                <div class="device-bottom">
                    <div>
                        <span>Trạng thái</span>
                        <strong class="${isPending ? "pending-state" : ""}">
                            ${displayState}
                        </strong>
                    </div>

                    <button
                        class="switch ${
                            state === "ON" ? "active-switch" : ""
                        }"
                        type="button"
                        data-action="toggle-device"
                        ${online && !isPending ? "" : "disabled"}>
                        <span></span>
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

// phân trăm nhiệt độ, ánh sáng, độ ẩm
async function loadDashboard() {
    if (dashboardLoading) return;
    dashboardLoading = true;

    try {
        const result = await window.api.getDashboard();
        const data = result.data;

        updateSensor(data.temperature, "temperatureValue", "temperatureTime", "temperatureBar", 50);
        updateSensor(data.humidity, "humidityValue", "humidityTime", "humidityBar", 100);
        updateSensor(data.light, "lightValue", "lightTime", "lightBar", 1024 );
        updateNodeStatus(data);
        renderDevices(data.devices || []);
        updateSensorChart(data.chartData || []);
    } catch (error) {
        console.error("Không tải được dashboard:", error);
    } finally {
        dashboardLoading = false;
    }
}

// xử lý nút bật tắt đèn
deviceGrid.addEventListener("click", async event => {
    const button = event.target.closest('[data-action="toggle-device"]');

    if (!button) return;

    const card = button.closest(".device-card");
    const stateElement = card.querySelector(".device-bottom strong");
    const deviceId = card.dataset.deviceId;
    const currentState = card.dataset.currentState;
    const action = currentState === "ON" ? "OFF" : "ON";

    pendingCommands.set(deviceId, {
        action,
        startedAt: Date.now()
    });

    stateElement.textContent = "PENDING";
    stateElement.classList.add("pending-state");
    button.disabled = true;

    try {
        await window.api.controlDevice(deviceId, action);
        await loadDashboard();
    } catch (error) {
        pendingCommands.delete(deviceId);
        alert(error.message);
        await loadDashboard();
    }
});

// xử lý trạng thái của các thiết bị
function updateNodeStatus(data) {
    const node = data.node;
    const nodeName = document.getElementById("nodeName");
    const nodeStatus = document.getElementById("nodeStatus");
    const lastSeen = document.getElementById("lastSeen");
    const sensorCount = document.getElementById("sensorCount");
    const deviceCount = document.getElementById("deviceCount");
    const systemText = document.getElementById("systemStatusText");
    const systemDescription = document.getElementById("systemStatusDescription");
    const systemUpdatedAt = document.getElementById("systemUpdatedAt");
    const systemConnection = document.querySelector(".system-online");
    const systemConnectionText = document.getElementById("systemConnectionText");

    const online = node?.connectionStatus === "online";
    systemConnection.classList.toggle("offline", !online);
    systemConnectionText.textContent = online ? "1/1 ESP8266 Online" : "0/1 ESP8266 Online";
    const activeWindowMs = 6000;

    const isFresh = sensor => {
        if (!sensor?.recordedAt) return false;

        const recordedAt = new Date(sensor.recordedAt).getTime();
        return (
            Number.isFinite(recordedAt) &&
            Date.now() - recordedAt <= activeWindowMs
        );
    };

    const dht11Active = online && isFresh(data.temperature) && isFresh(data.humidity);
    const lightSensorActive = online && isFresh(data.light);
    const activeSensorCount = Number(dht11Active) + Number(lightSensorActive);

    sensorCount.textContent = `${activeSensorCount}/2`;
    deviceCount.textContent = String((data.devices || []).length);

    if (!node) {
        nodeName.textContent = "--";
        nodeStatus.textContent = "OFFLINE";
        nodeStatus.className = "badge badge-offline";
        lastSeen.textContent = "--";
        systemUpdatedAt.textContent = "--";
        systemText.textContent = "Chưa nhận được telemetry";
        systemDescription.textContent = "Đang chờ ESP8266 kết nối.";
        return;
    }

    const lastSeenText = node.lastSeen ? new Date(node.lastSeen).toLocaleString("vi-VN") : "--";

    nodeName.textContent = node.name;
    nodeStatus.textContent = online ? "ONLINE" : "OFFLINE";
    nodeStatus.className = `badge ${online ? "badge-online" : "badge-offline"}`;
    lastSeen.textContent = lastSeenText;
    systemUpdatedAt.textContent = lastSeenText;
    systemText.textContent = online ? "Hệ thống hoạt động bình thường" : "ESP8266 đang offline";
    systemDescription.textContent = online ? `Đã nhận telemetry từ ${node.deviceCode}.` : `Không thể kết nối tới ${node.deviceCode}.`;
}

// Lọc loại cảm biến trên biểu đồ
function applyChartFilter() {
    if (!sensorChart) return;

    const selected = sensorFilter.value;

    sensorChart.data.datasets.forEach(dataset => {
        dataset.hidden = selected !== "all" && dataset.sensorType !== selected;
    });
}

// biểu đồ
function updateSensorChart(items) {
    const timestamps = [
        ...new Set(
            items.map(item => item.recordedAt)
        )
    ].sort();

    const labels = timestamps.map(value =>
        new Date(value).toLocaleTimeString("vi-VN")
    );

    function valuesFor(type) {
        const values = new Map(
            items.filter(item => item.type === type).map(item => [item.recordedAt, Number(item.type != "LIGHT" ? item.value : Math.round(item.value / 1024 * 100))])
        );

        return timestamps.map(time =>
            values.has(time) ? values.get(time) : null
        );
    }

    const datasets = [
        {
            label: "Nhiệt độ",
            sensorType: "temperature",
            data: valuesFor("TEMPERATURE"),
            borderColor: "#ef4444",
            backgroundColor: "#ef4444",
            tension: 0.3,
            spanGaps: true
        },
        {
            label: "Độ ẩm",
            sensorType: "humidity",
            data: valuesFor("HUMIDITY"),
            borderColor: "#3b82f6",
            backgroundColor: "#3b82f6",
            tension: 0.3,
            spanGaps: true
        },
        {
            label: "Ánh sáng",
            sensorType: "light",
            data: valuesFor("LIGHT"),
            borderColor: "#f59e0b",
            backgroundColor: "#f59e0b",
            tension: 0.3,
            spanGaps: true
        }
    ];

    if (!sensorChart) {
        const canvas = document.getElementById("sensorChart");

        sensorChart = new Chart(canvas, {
            type: "line",
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: "index",
                    intersect: false
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } else {
        sensorChart.data.labels = labels;

        datasets.forEach((dataset, index) => {
            sensorChart.data.datasets[index].data = dataset.data;
        });
    }

    applyChartFilter();
    sensorChart.update("none");
}

sensorFilter.addEventListener("change", () => {
    applyChartFilter();
    sensorChart?.update();
});

loadDashboard();
setInterval(loadDashboard, 2000);

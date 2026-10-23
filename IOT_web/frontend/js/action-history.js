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

const emptyState = document.querySelector(".nothing");
const filterPanel = document.querySelector(".filter-panel");
const tableCard = document.querySelector(".data-table-card");
const tableBody = document.querySelector(".data-table tbody");
const paginationContainer = document.getElementById("pagination");
const pageSizeSelect = document.getElementById("actionPageSize");
const deviceFilter = document.getElementById("deviceFilter");
const actionFilter = document.getElementById("actionFilter");
const statusFilter = document.getElementById("statusFilter");
const searchInput = document.getElementById("actionSearch");
const searchButton = document.querySelector(".search-btn");
const resetButton = document.querySelector(".reset-btn");

let activeFilter = {};
let currentPage = 1;
let pageSize = Number(pageSizeSelect.value);
let actionRequestId = 0;

function formatDateTime(value) {
    if (!value) return "--";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Bangkok",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(date);
}

function appendCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    cell.className = className;
    row.appendChild(cell);
    return cell;
}

function renderActions(items) {
    tableBody.replaceChildren();

    items.forEach(item => {
        const row = document.createElement("tr");
        const status = String(item.status || "PENDING").toLowerCase();

        appendCell(row, `#${String(item.id).padStart(4, "0")}`);
        appendCell(row, item.username || "--");
        appendCell(row, item.deviceId || "--");
        appendCell(row, item.deviceName || item.deviceId || "--");
        appendCell(row, item.action || "--", "action-cell");

        const statusCell = appendCell(row, "");
        const badge = document.createElement("span");
        badge.className = `status-badge status-${status}`;
        badge.textContent = String(item.status || "PENDING").toUpperCase();
        statusCell.appendChild(badge);

        appendCell(row, formatDateTime(item.requestedAt));
        appendCell(row, formatDateTime(item.respondedAt));
        appendCell(row, item.latencyMs == null ? "--" : `${item.latencyMs} ms`);

        tableBody.appendChild(row);
    });
}

function setActionDataState(hasData) {
    emptyState.classList.toggle("hidden", hasData);
    filterPanel.classList.remove("hidden");
    tableCard.classList.toggle("hidden", !hasData);
}

function renderPagination(pagination) {
    paginationContainer.replaceChildren();

    const totalPages = Number(pagination.totalPages) || 0;
    currentPage = Number(pagination.page) || 1;

    if (totalPages <= 1) return;

    function addButton(label, page, disabled, active = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        button.classList.toggle("page-active", active);
        button.onclick = () => {
            if (!disabled && page !== currentPage) loadActions(page);
        };
        paginationContainer.appendChild(button);
    }

    addButton("‹", currentPage - 1, currentPage === 1);

    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    for (let page = startPage; page <= endPage; page += 1) {
        addButton(String(page), page, false, page === currentPage);
    }

    addButton("›", currentPage + 1, currentPage === totalPages);
}

async function loadActions(page = currentPage) {
    const requestId = ++actionRequestId;
    const filterSnapshot = { ...activeFilter };

    try {
        const result = await window.api.getActions({
            page,
            limit: pageSize,
            ...filterSnapshot
        });

        if (requestId !== actionRequestId) return;

        const items = Array.isArray(result.data) ? result.data : [];
        renderActions(items);
        renderPagination(result.pagination);
        setActionDataState(items.length > 0);
    } catch (error) {
        if (requestId !== actionRequestId) return;

        console.error("Không thể tải lịch sử hành động:", error);
        tableBody.replaceChildren();
        setActionDataState(false);
        const message = document.querySelector(".nothing label");
        if (message) message.textContent = "Không thể tải lịch sử hành động";
    }
}

function applyFilters(includeTime = true) {
    activeFilter = {};

    if (deviceFilter.value) activeFilter.device = deviceFilter.value;
    if (actionFilter.value) activeFilter.action = actionFilter.value;
    if (statusFilter.value) activeFilter.status = statusFilter.value;

    const time = searchInput.value.trim();
    if (includeTime && time) activeFilter.time = time;

    currentPage = 1;
    loadActions(1);
}

function loadDeviceFilterOptions() {
    return window.api.getDevices()
        .then(result => {
            const devices = Array.isArray(result.data) ? result.data : [];
            deviceFilter.replaceChildren();

            const allOption = document.createElement("option");
            allOption.value = "";
            allOption.textContent = "Tất cả thiết bị";
            deviceFilter.appendChild(allOption);

            devices.forEach(device => {
                const option = document.createElement("option");
                option.value = device.deviceCode;
                option.textContent = `${device.name} (${device.deviceCode})`;
                deviceFilter.appendChild(option);
            });
        })
        .catch(error => console.error("Không tải được danh sách thiết bị:", error));
}

pageSizeSelect.addEventListener("change", () => {
    pageSize = Number(pageSizeSelect.value);
    currentPage = 1;
    loadActions(1);
});

[deviceFilter, actionFilter, statusFilter].forEach(filter => {
    filter.addEventListener("change", () => applyFilters(false));
});

searchButton.addEventListener("click", () => applyFilters(true));
searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        applyFilters(true);
    }
});

resetButton.addEventListener("click", () => {
    searchInput.value = "";
    deviceFilter.value = "";
    actionFilter.value = "";
    statusFilter.value = "";
    activeFilter = {};
    currentPage = 1;
    loadActions(1);
});

loadDeviceFilterOptions();
loadActions(1);

setInterval(() => {
    // Giữ nguyên kết quả tìm thời gian cho đến khi người dùng đặt lại.
    if (searchInput.value.trim()) return;
    loadActions(currentPage);
}, 2000);

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
const lastUpdate = document.getElementById("lastUpdate");
const paginationContainer = document.getElementById("pagination");
const pageSizeSelect = document.getElementById("sensorPageSize");
const searchInput = document.getElementById("sensorSearch");
const searchType = document.getElementById("sensorSearchType");
const searchButton = document.querySelector(".search-btn");
const resetButton = document.querySelector(".reset-btn");

const searchLabels = {
    TEMPERATURE: "nhiệt độ",
    HUMIDITY: "độ ẩm",
    LIGHT: "ánh sáng",
    TIME: "thời gian (YYYY-MM-DD HH:mm:ss)"
};

let activeFilter = {};
let currentPage = 1;
let pageSize = Number(pageSizeSelect.value);
let sensorRequestId = 0;

function updateSearchPlaceholder() {
    searchInput.placeholder = `Nhập giá trị ${searchLabels[searchType.value] || "tìm kiếm"}`;
}

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

function setSensorDataState(hasData) {
    emptyState.classList.toggle("hidden", hasData);
    filterPanel.classList.remove("hidden");
    tableCard.classList.toggle("hidden", !hasData);
}

function appendCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    cell.className = className;
    row.appendChild(cell);
}

function renderSensorData(items) {
    tableBody.replaceChildren();

    items.forEach(item => {
        const row = document.createElement("tr");
        const displayValue = item.value;

        appendCell(row, `#${String(item.id).padStart(4, "0")}`);
        appendCell(row, item.sensorId || "--");
        appendCell(row, item.sensorName || item.type || "--");
        appendCell(row, displayValue ?? "--", "value-cell");
        appendCell(row, item.unit || "--");
        appendCell(row, formatDateTime(item.recordedAt));
        tableBody.appendChild(row);
    });
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
            if (!disabled && page !== currentPage) loadSensorData(page);
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

async function loadSensorData(page = currentPage) {
    const requestId = ++sensorRequestId;
    const filterSnapshot = { ...activeFilter };

    try {
        const result = await window.api.getSensorData({
            page,
            limit: pageSize,
            ...filterSnapshot
        });

        if (requestId !== sensorRequestId) return;

        const items = Array.isArray(result.data) ? result.data : [];
        renderSensorData(items);
        renderPagination(result.pagination);
        setSensorDataState(items.length > 0);

        if (lastUpdate && items.length > 0) {
            lastUpdate.textContent = new Date().toLocaleTimeString("vi-VN");
        }
    } catch (error) {
        if (requestId !== sensorRequestId) return;

        console.error("Không thể tải dữ liệu cảm biến:", error);
        tableBody.replaceChildren();
        setSensorDataState(false);
        const message = document.querySelector(".nothing label");
        if (message) message.textContent = "Không thể tải dữ liệu cảm biến";
    }
}

function applySensorSearch() {
    activeFilter = {};

    const query = searchInput.value.trim();
    if (query) {
        activeFilter.searchType = searchType.value;
        activeFilter.q = query;
    }

    currentPage = 1;
    loadSensorData(1);
}

searchType.addEventListener("change", updateSearchPlaceholder);

searchButton.addEventListener("click", applySensorSearch);
searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        applySensorSearch();
    }
});

resetButton.addEventListener("click", () => {
    searchInput.value = "";
    searchType.value = "TEMPERATURE";
    updateSearchPlaceholder();
    activeFilter = {};
    currentPage = 1;
    loadSensorData(1);
});

pageSizeSelect.addEventListener("change", () => {
    pageSize = Number(pageSizeSelect.value);
    currentPage = 1;
    loadSensorData(1);
});

updateSearchPlaceholder();
loadSensorData(1);

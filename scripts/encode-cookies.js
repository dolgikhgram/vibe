#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const cookiesPath = path.join(__dirname, "..", "cookies.json");
if (!fs.existsSync(cookiesPath)) {
  console.error("cookies.json not found. Export cookies from SoundCloud first.");
  process.exit(1);
}

const cookies = JSON.parse(fs.readFileSync(cookiesPath, "utf-8"));
const base64 = Buffer.from(JSON.stringify(cookies)).toString("base64");

console.log("\nSOUNDCLOUD_COOKIES (для Railway/Render/Docker):\n");
console.log(base64);
console.log("\n");

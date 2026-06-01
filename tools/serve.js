#!/usr/bin/env node
/* Minimal zero-dependency static file server for NOVA LANCE.
   Usage: node tools/serve.js [port]
   Also exports start(port) for the QA harness. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp"
};

function handler(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}

function start(port) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(port || 0, () => resolve(srv));
  });
}

module.exports = { start };

if (require.main === module) {
  const port = parseInt(process.argv[2], 10) || 8080;
  start(port).then((srv) => {
    const a = srv.address();
    console.log(`NOVA LANCE serving at http://localhost:${a.port}/`);
  });
}

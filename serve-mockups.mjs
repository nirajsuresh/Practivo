import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve from the main repo's design folder (worktree shares the same git root area)
const candidates = [
  join(__dirname, "design/practice-mockups"),
  join(__dirname, "../../..", "design/practice-mockups"), // from .claude/worktrees/brave-benz up to main repo
];

// Find which path exists
import { stat } from "fs/promises";
let root;
for (const c of candidates) {
  try { await stat(c); root = c; break; } catch {}
}
if (!root) throw new Error("Could not find design/practice-mockups");

const port = 4444;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
};

createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = join(root, path);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[extname(filePath)] || "text/plain" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(port, () => console.log(`Mockups at http://localhost:${port}`));

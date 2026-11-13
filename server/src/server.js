const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : false }));
app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "nevoz.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS cloud_pcs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  os TEXT NOT NULL,
  ram_gb INTEGER NOT NULL,
  storage_gb INTEGER NOT NULL,
  gpu TEXT NOT NULL,
  volume_id TEXT NOT NULL UNIQUE,
  vm_status TEXT NOT NULL DEFAULT 'not_provisioned',
  progress_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS persistent_disks (
  disk_id TEXT PRIMARY KEY,
  pc_id TEXT NOT NULL UNIQUE REFERENCES cloud_pcs(id) ON DELETE RESTRICT,
  size_gb INTEGER NOT NULL,
  provider_volume_id TEXT,
  state TEXT NOT NULL DEFAULT 'metadata_only',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  pc_id TEXT NOT NULL REFERENCES cloud_pcs(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'api',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_pc_time ON checkpoints(pc_id, created_at DESC);
`);

const getPc = db.prepare("SELECT * FROM cloud_pcs WHERE id = ?");
const getAll = db.prepare("SELECT p.*, d.state AS disk_state FROM cloud_pcs p LEFT JOIN persistent_disks d ON d.pc_id=p.id ORDER BY p.updated_at DESC");

function sendError(res, status, code, message) {
  return res.status(status).json({ ok: false, error: code, message });
}
function validConfig(b) {
  const osOk = ["Windows 11", "Windows 11 Pro", "Windows 11 Enterprise"].includes(b.os);
  const gpuOk = typeof b.gpu === "string" && b.gpu.length <= 80;
  return typeof b.id === "string" && b.id.length <= 64 &&
    typeof b.name === "string" && b.name.trim().length > 0 && b.name.length <= 64 &&
    osOk && Number.isInteger(b.ram_gb) && b.ram_gb >= 4 && b.ram_gb <= 256 &&
    Number.isInteger(b.storage_gb) && b.storage_gb >= 64 && b.storage_gb <= 4096 &&
    gpuOk && typeof b.volume_id === "string" && b.volume_id.length >= 8 && b.volume_id.length <= 100;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "NEVOZ SETUP API", provider: "not_configured" }));
app.use('/api', requireApiToken);

function requireApiToken(req, res, next) {
  const configured = process.env.API_TOKEN || "";
  if (configured.length < 32) {
    return sendError(res, 503, "API_TOKEN_NOT_CONFIGURED",
      "Configure um API_TOKEN privado com pelo menos 32 caracteres no servidor.");
  }
  const auth = String(req.headers.authorization || "");
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return sendError(res, 401, "UNAUTHORIZED", "Token inválido.");
  }
  next();
}


app.get("/api/pcs", (_req, res) => res.json(getAll.all()));

app.post("/api/pcs/sync", (req, res) => {
  const b = req.body || {};
  if (!validConfig(b)) return sendError(res, 400, "INVALID_PC_PROFILE", "Configuração de PC inválida.");

  const now = new Date().toISOString();
  const previous = getPc.get(b.id);
  const incomingNote = typeof b.progress_note === "string" ? b.progress_note.trim().slice(0,2000) : "";
  const sync = db.transaction(() => {
    db.prepare(`
      INSERT INTO cloud_pcs (id,name,os,ram_gb,storage_gb,gpu,volume_id,progress_note,created_at,updated_at)
      VALUES (@id,@name,@os,@ram_gb,@storage_gb,@gpu,@volume_id,@progress_note,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, os=excluded.os, ram_gb=excluded.ram_gb,
        storage_gb=excluded.storage_gb, gpu=excluded.gpu,
        volume_id=excluded.volume_id, progress_note=excluded.progress_note,
        updated_at=excluded.updated_at
    `).run({
      id:b.id, name:b.name.trim(), os:b.os, ram_gb:b.ram_gb,
      storage_gb:b.storage_gb, gpu:b.gpu, volume_id:b.volume_id,
      progress_note: incomingNote,
      created_at:now, updated_at:now
    });

    if (incomingNote && (!previous || previous.progress_note !== incomingNote)) {
      db.prepare("INSERT INTO checkpoints (id,pc_id,note,source,created_at) VALUES (?,?,?,?,?)")
        .run(crypto.randomUUID(), b.id, incomingNote, "android-sync", now);
    }

    db.prepare(`
      INSERT INTO persistent_disks (disk_id,pc_id,size_gb,state,created_at,updated_at)
      VALUES (?,?,?,'metadata_only',?,?)
      ON CONFLICT(disk_id) DO UPDATE SET size_gb=excluded.size_gb, updated_at=excluded.updated_at
    `).run(b.volume_id, b.id, b.storage_gb, now, now);
  });
  sync();
  res.status(200).json({
    ok: true,
    saved: true,
    pc_id: b.id,
    volume_id: b.volume_id,
    disk_state: "metadata_only",
    note: "Perfil e referência do disco sincronizados. Um provedor ainda precisa criar o disco de blocos real."
  });
});

app.post("/api/pcs/:id/checkpoints", (req, res) => {
  const pc = getPc.get(req.params.id);
  if (!pc) return sendError(res, 404, "PC_NOT_FOUND", "Cloud PC não encontrado.");
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0,2000) : "";
  if (!note) return sendError(res, 400, "EMPTY_CHECKPOINT", "Escreva uma nota antes de salvar o checkpoint.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const latest = db.prepare("SELECT id,note FROM checkpoints WHERE pc_id=? ORDER BY created_at DESC LIMIT 1")
    .get(pc.id);
  if (latest && latest.note === note) {
    db.prepare("UPDATE cloud_pcs SET progress_note=?,updated_at=? WHERE id=?").run(note, now, pc.id);
    return res.status(200).json({ ok: true, id: latest.id, pc_id: pc.id, saved_at: now, deduplicated: true });
  }
  db.transaction(() => {
    db.prepare("INSERT INTO checkpoints (id,pc_id,note,source,created_at) VALUES (?,?,?,?,?)")
      .run(id, pc.id, note, String(req.body?.source || "api").slice(0,40), now);
    db.prepare("UPDATE cloud_pcs SET progress_note=?,updated_at=? WHERE id=?").run(note, now, pc.id);
  })();
  res.status(201).json({ ok: true, id, pc_id: pc.id, saved_at: now });
});

app.get("/api/pcs/:id/checkpoints", (req, res) => {
  if (!getPc.get(req.params.id)) return sendError(res, 404, "PC_NOT_FOUND", "Cloud PC não encontrado.");
  res.json(db.prepare("SELECT id,note,source,created_at FROM checkpoints WHERE pc_id=? ORDER BY created_at DESC")
    .all(req.params.id));
});

// No fake VM state: start/stop stay disabled until a real provider adapter exists.
app.post("/api/pcs/:id/start", (req, res) => {
  if (!getPc.get(req.params.id)) return sendError(res, 404, "PC_NOT_FOUND", "Cloud PC não encontrado.");
  return sendError(res, 501, "PROVIDER_NOT_CONFIGURED",
    "O perfil está salvo, mas falta configurar um provedor que crie Windows VM e disco persistente.");
});
app.post("/api/pcs/:id/stop", (req, res) => {
  if (!getPc.get(req.params.id)) return sendError(res, 404, "PC_NOT_FOUND", "Cloud PC não encontrado.");
  return sendError(res, 501, "PROVIDER_NOT_CONFIGURED",
    "Nenhuma VM real está conectada. O registro e a referência do disco permanecem salvos.");
});

app.get("/api/pcs/:id/storage", (req, res) => {
  const row = db.prepare(`
    SELECT d.disk_id,d.size_gb,d.provider_volume_id,d.state,d.created_at,d.updated_at
    FROM persistent_disks d WHERE d.pc_id=?
  `).get(req.params.id);
  if (!row) return sendError(res, 404, "DISK_NOT_FOUND", "Referência de disco não encontrada.");
  res.json({ ...row, persistent_by_provider: row.state === "attached" });
});

app.use((err, _req, res, _next) => {
  console.error("NEVOZ API error:", err.message);
  sendError(res, 500, "INTERNAL_ERROR", "Erro interno da API.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NEVOZ SETUP API listening on port ${PORT}`);
});

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/scheduler.db');

// Garante que a pasta data existe
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Habilita WAL mode para melhor performance
db.exec('PRAGMA journal_mode = WAL');

// Cria as tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    contact_name TEXT,
    message TEXT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at DATETIME,
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bulk_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phones TEXT NOT NULL,
    message TEXT NOT NULL,
    total INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrações: adiciona colunas novas se não existirem
const migrateColumn = (table, column, definition) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Migração: ${table}.${column} adicionado`);
  } catch (e) {
    // Coluna já existe, ignora
  }
};

// Tabela de rastreamento de entrega de mensagens
db.exec(`
  CREATE TABLE IF NOT EXISTS delivery_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bulk_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    msg_id TEXT,
    wa_status INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_delivery_msg_id ON delivery_tracking (msg_id);
  CREATE INDEX IF NOT EXISTS idx_delivery_bulk_id ON delivery_tracking (bulk_id);
`);

migrateColumn('scheduled_messages', 'recipient_type', "TEXT DEFAULT 'number'");
migrateColumn('scheduled_messages', 'recipient_id', 'TEXT');
migrateColumn('bulk_messages', 'results', "TEXT DEFAULT '[]'");
migrateColumn('bulk_messages', 'paused_index', 'INTEGER DEFAULT 0');
migrateColumn('bulk_messages', 'delay_seconds', 'INTEGER DEFAULT 2');
migrateColumn('bulk_messages', 'batch_size', 'INTEGER DEFAULT 0');
migrateColumn('bulk_messages', 'batch_delay_seconds', 'INTEGER DEFAULT 30');
migrateColumn('bulk_messages', 'messages_json', 'TEXT DEFAULT NULL');

// Ao iniciar, marca envios em massa que ficaram "running" como "failed" (servidor foi reiniciado)
db.exec("UPDATE bulk_messages SET status = 'failed' WHERE status = 'running'")

// Cria usuário admin padrão se não existir
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('admin123', salt, 64).toString('hex');
  db.prepare("INSERT INTO users (username, password_hash) VALUES ('admin', ?)").run(`${salt}:${hash}`);
  console.log('[DB] Usuário admin criado (senha: admin123)');
}

module.exports = db;

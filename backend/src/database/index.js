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

// Tabelas de Grupos VIP
db.exec(`
  CREATE TABLE IF NOT EXISTS lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vip_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lancamento_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    admin_phone TEXT NOT NULL,
    admin_name TEXT,
    wa_group_id TEXT,
    status TEXT DEFAULT 'pending',
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
  );
`);

// Rastreamento de entrega em mensagens agendadas
migrateColumn('scheduled_messages', 'msg_id',    'TEXT');
migrateColumn('scheduled_messages', 'wa_status', 'INTEGER DEFAULT NULL');

// Store persistente de mensagens — evita o erro "Aguardando mensagem" no WhatsApp
db.exec(`
  CREATE TABLE IF NOT EXISTS message_store (
    id        TEXT NOT NULL,
    user_id   INTEGER NOT NULL,
    msg_json  TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_msgstore_user ON message_store(user_id);
`);

// Limpa mensagens com mais de 7 dias ao iniciar (não precisam ficar para sempre)
db.exec("DELETE FROM message_store WHERE created_at < datetime('now', '-7 days')");

// Tabelas TICKFY — integração com G-ticket
db.exec(`
  CREATE TABLE IF NOT EXISTS tickfy_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    link_sistema TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    event_ids TEXT DEFAULT '[]',
    last_trn_id INTEGER DEFAULT 0,
    poll_interval INTEGER DEFAULT 3,
    active INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tickfy_message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status_code TEXT NOT NULL,
    status_label TEXT NOT NULL,
    message TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    UNIQUE(user_id, status_code)
  );

  CREATE TABLE IF NOT EXISTS tickfy_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    trn_id INTEGER NOT NULL,
    eve_cod TEXT,
    evento TEXT,
    comprador_nome TEXT,
    comprador_telefone TEXT,
    comprador_email TEXT,
    valor REAL,
    status_code TEXT,
    wa_sent INTEGER DEFAULT 0,
    wa_msg_id TEXT,
    wa_error TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tickfy_sales_user ON tickfy_sales(user_id);
  CREATE INDEX IF NOT EXISTS idx_tickfy_sales_trn ON tickfy_sales(trn_id);
`);

// Migrações multi-usuário
migrateColumn('contacts',           'user_id', 'INTEGER NOT NULL DEFAULT 1');
migrateColumn('scheduled_messages', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
migrateColumn('bulk_messages',      'user_id', 'INTEGER NOT NULL DEFAULT 1');
migrateColumn('lancamentos',        'user_id', 'INTEGER NOT NULL DEFAULT 1');
migrateColumn('users', 'display_name', 'TEXT');
migrateColumn('users', 'email',        'TEXT');
migrateColumn('users', 'is_admin',     'INTEGER NOT NULL DEFAULT 0');

// Ao iniciar, marca envios em massa que ficaram "running" como "failed" (servidor foi reiniciado)
db.exec("UPDATE bulk_messages SET status = 'failed' WHERE status = 'running'")

// ─── Módulo Financeiro (finwa) ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    wa_group_id TEXT DEFAULT NULL,
    color TEXT DEFAULT '#3B82F6',
    icon TEXT DEFAULT '💰',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS finance_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'both',
    color TEXT DEFAULT '#6B7280',
    icon TEXT DEFAULT '📂',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS finance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT DEFAULT '',
    category_id INTEGER DEFAULT NULL,
    date TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    wa_msg_id TEXT DEFAULT NULL,
    wa_sender TEXT DEFAULT NULL,
    receipt_path TEXT DEFAULT NULL,
    receipt_requested INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES finance_entities(id),
    FOREIGN KEY (category_id) REFERENCES finance_categories(id)
  );
  CREATE INDEX IF NOT EXISTS idx_fin_txn_entity ON finance_transactions(entity_id);
  CREATE INDEX IF NOT EXISTS idx_fin_txn_user ON finance_transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_fin_txn_date ON finance_transactions(date);

  CREATE TABLE IF NOT EXISTS finance_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity_id INTEGER DEFAULT NULL,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category_id, entity_id, month, year)
  );

  CREATE TABLE IF NOT EXISTS finance_budget_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_id INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(budget_id, threshold, month, year)
  );
`);

// Insere categorias padrão para cada usuário que ainda não as tem
const insertDefaultCategories = (userId) => {
  const existing = db.prepare('SELECT COUNT(*) as c FROM finance_categories WHERE user_id = ?').get(userId);
  if (existing.c > 0) return;
  const defaults = [
    { name: 'Alimentação',   type: 'expense', color: '#EF4444', icon: '🍔' },
    { name: 'Transporte',    type: 'expense', color: '#F97316', icon: '🚗' },
    { name: 'Aluguel',       type: 'expense', color: '#EAB308', icon: '🏠' },
    { name: 'Utilidades',    type: 'expense', color: '#84CC16', icon: '💡' },
    { name: 'Fornecedores',  type: 'expense', color: '#06B6D4', icon: '📦' },
    { name: 'Marketing',     type: 'expense', color: '#8B5CF6', icon: '📢' },
    { name: 'Outros Gastos', type: 'expense', color: '#6B7280', icon: '📌' },
    { name: 'Vendas',        type: 'income',  color: '#10B981', icon: '💼' },
    { name: 'Salário',       type: 'income',  color: '#22C55E', icon: '💵' },
    { name: 'Transferência', type: 'income',  color: '#3B82F6', icon: '🔄' },
    { name: 'Outras Rendas', type: 'income',  color: '#14B8A6', icon: '➕' },
  ];
  const stmt = db.prepare('INSERT INTO finance_categories (user_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)');
  for (const cat of defaults) {
    stmt.run(userId, cat.name, cat.type, cat.color, cat.icon);
  }
};

// ── Migrações IA — Phase 1 ────────────────────────────────────────────────────
migrateColumn('finance_transactions', 'confidence',        'REAL DEFAULT 1.0');
migrateColumn('finance_transactions', 'enrichment_status', "TEXT DEFAULT 'complete'");
migrateColumn('finance_transactions', 'ai_notes',          'TEXT DEFAULT NULL');
migrateColumn('finance_transactions', 'pending_fields',    'TEXT DEFAULT NULL');
migrateColumn('finance_transactions', 'ocr_raw',           'TEXT DEFAULT NULL');

// Tabela de memória de fornecedores (aprendizado da IA)
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_vendor_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    vendor_key TEXT NOT NULL,
    vendor_display TEXT NOT NULL,
    aliases TEXT DEFAULT '[]',
    category_id INTEGER DEFAULT NULL,
    type TEXT DEFAULT 'expense',
    transaction_count INTEGER DEFAULT 1,
    last_seen DATE,
    confidence REAL DEFAULT 0.5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, vendor_key)
  );
`);

// Tabela de histórico de correções da IA
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    correction_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── FinWA v2.0 — Novas tabelas ────────────────────────────────────────────────

// Transações Recorrentes
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_recurring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER DEFAULT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    day_of_month INTEGER DEFAULT NULL,
    day_of_week INTEGER DEFAULT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT DEFAULT NULL,
    last_generated TEXT DEFAULT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_recurring_user ON finance_recurring(user_id);
`);

// Contas a Pagar/Receber
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_payables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER DEFAULT NULL,
    counterpart TEXT DEFAULT NULL,
    due_date TEXT NOT NULL,
    paid_date TEXT DEFAULT NULL,
    transaction_id INTEGER DEFAULT NULL,
    wa_alerted INTEGER DEFAULT 0,
    wa_confirmed INTEGER DEFAULT 0,
    installment_total INTEGER DEFAULT 1,
    installment_current INTEGER DEFAULT 1,
    recurring_id INTEGER DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_payables_due ON finance_payables(due_date);
  CREATE INDEX IF NOT EXISTS idx_payables_user ON finance_payables(user_id);
`);

// Projetos/Eventos P&L
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'event',
    start_date TEXT DEFAULT NULL,
    end_date TEXT DEFAULT NULL,
    budget REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    description TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user ON finance_projects(user_id);
`);

// Vínculo transação ↔ projeto
migrateColumn('finance_transactions', 'project_id', 'INTEGER DEFAULT NULL');

// Aplica categorias padrão para usuários existentes
const allUsers = db.prepare('SELECT id FROM users').all();
for (const u of allUsers) insertDefaultCategories(u.id);

// ─── Módulo CRM Kanban ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'entrou_contato',
    source TEXT,
    responsible_user_id INTEGER,
    temperature TEXT DEFAULT 'morno',
    potential_value REAL,
    closed_value REAL,
    loss_reason TEXT,
    loss_reason_detail TEXT,
    automations_enabled INTEGER DEFAULT 1,
    first_contact_at DATETIME,
    last_interaction_at DATETIME,
    stage_changed_at DATETIME,
    position INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, phone)
  );
  CREATE INDEX IF NOT EXISTS idx_crm_leads_user_stage ON crm_leads(user_id, stage);

  CREATE TABLE IF NOT EXISTS crm_lead_event (
    lead_id INTEGER PRIMARY KEY,
    event_name TEXT,
    city TEXT,
    event_date TEXT,
    event_type TEXT,
    expected_audience INTEGER,
    sells_tickets INTEGER,
    ticket_platform TEXT,
    runs_paid_ads INTEGER,
    has_creative_team INTEGER,
    main_difficulty TEXT,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS crm_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    meeting_at DATETIME NOT NULL,
    format TEXT,
    link TEXT,
    notes TEXT,
    status TEXT DEFAULT 'scheduled',
    summary TEXT,
    client_pains TEXT,
    client_needs TEXT,
    estimated_budget REAL,
    close_probability INTEGER,
    next_step TEXT,
    next_followup_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_crm_meetings_lead ON crm_meetings(lead_id);

  CREATE TABLE IF NOT EXISTS crm_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    due_date TEXT,
    sent_at DATETIME,
    amount REAL,
    negotiated_amount REAL,
    payment_terms TEXT,
    commission TEXT,
    scope TEXT,
    service TEXT,
    file_url TEXT,
    expected_response_at TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_crm_proposals_lead ON crm_proposals(lead_id);

  CREATE TABLE IF NOT EXISTS crm_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#F97316',
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS crm_lead_tags (
    lead_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (lead_id, tag_id),
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES crm_tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS crm_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    due_date TEXT,
    done_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON crm_tasks(lead_id);

  CREATE TABLE IF NOT EXISTS crm_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at DATETIME,
    msg_id TEXT,
    error_msg TEXT,
    stage_at_schedule TEXT,
    automation_type TEXT,
    meeting_id INTEGER,
    proposal_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (meeting_id) REFERENCES crm_meetings(id) ON DELETE SET NULL,
    FOREIGN KEY (proposal_id) REFERENCES crm_proposals(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crm_followups_pending ON crm_followups(status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_crm_followups_lead ON crm_followups(lead_id);

  CREATE TABLE IF NOT EXISTS crm_message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    body TEXT,
    wa_msg_id TEXT,
    followup_id INTEGER,
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (followup_id) REFERENCES crm_followups(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crm_msg_log_lead ON crm_message_log(lead_id, occurred_at);

  CREATE TABLE IF NOT EXISTS crm_settings (
    user_id INTEGER PRIMARY KEY,
    business_hours_json TEXT,
    auto_create_leads INTEGER DEFAULT 1,
    templates_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crm_lid_phone (
    lid  TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lid, user_id)
  );

  CREATE TABLE IF NOT EXISTS crm_seen_dm_jids (
    jid TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    phone TEXT,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (jid, user_id)
  );

  CREATE TABLE IF NOT EXISTS crm_stage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_crm_stage_history_lead ON crm_stage_history(lead_id);
  CREATE INDEX IF NOT EXISTS idx_crm_stage_history_user ON crm_stage_history(user_id, to_stage);
`);

const DEFAULT_BUSINESS_HOURS = {
  mon: [{ from: '08:00', to: '20:00' }],
  tue: [{ from: '08:00', to: '20:00' }],
  wed: [{ from: '08:00', to: '20:00' }],
  thu: [{ from: '08:00', to: '20:00' }],
  fri: [{ from: '08:00', to: '20:00' }],
  sat: [{ from: '09:00', to: '14:00' }],
  sun: []
};

const DEFAULT_CRM_TEMPLATES = {
  no_reply_24h: '',
  no_reply_48h: '',
  no_reply_7d: '',
  meeting_morning: '',
  meeting_30min: '',
  proposal_24h: '',
  proposal_3d: '',
  proposal_5d: '',
  analyzing_2d: '',
  analyzing_5d: '',
  closed_welcome: ''
};

const DEFAULT_CRM_TAGS = [
  'Produtor de evento', 'Casa noturna', 'Rodeio', 'Festa universitária',
  'Show', 'Evento pequeno', 'Evento grande',
  'Lead quente', 'Lead frio', 'Precisa responder'
];

const ensureCrmSeeds = (userId) => {
  const settings = db.prepare('SELECT user_id FROM crm_settings WHERE user_id = ?').get(userId);
  if (!settings) {
    db.prepare(`INSERT INTO crm_settings (user_id, business_hours_json, templates_json) VALUES (?, ?, ?)`)
      .run(userId, JSON.stringify(DEFAULT_BUSINESS_HOURS), JSON.stringify(DEFAULT_CRM_TEMPLATES));
  }
  const tagCount = db.prepare('SELECT COUNT(*) as c FROM crm_tags WHERE user_id = ?').get(userId).c;
  if (tagCount === 0) {
    const stmt = db.prepare('INSERT INTO crm_tags (user_id, name, color) VALUES (?, ?, ?)');
    for (const name of DEFAULT_CRM_TAGS) stmt.run(userId, name, '#F97316');
  }
};

// Migração: adiciona webhook_token ao crm_settings se não existir
try {
  db.prepare('ALTER TABLE crm_settings ADD COLUMN webhook_token TEXT').run();
  console.log('[DB] Coluna webhook_token adicionada ao crm_settings');
} catch (e) { /* já existe */ }

// Migrações Sprint 3 — colunas adicionadas ao crm_leads
[
  ['responsible_user_id', 'INTEGER'],
  ['loss_reason',         'TEXT'],
  ['closed_value',        'REAL'],
  ['stage_changed_at',    'DATETIME'],
  ['first_contact_at',    'DATETIME'],
].forEach(([col, def]) => {
  try {
    db.prepare(`ALTER TABLE crm_leads ADD COLUMN ${col} ${def}`).run();
    console.log(`[DB] Coluna ${col} adicionada ao crm_leads`);
  } catch (e) { /* já existe */ }
});

for (const u of allUsers) ensureCrmSeeds(u.id);

// ── Etapa 7: tabela de metas gerenciais ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignee_user_id INTEGER NOT NULL,
    manager_user_id INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    period_year INTEGER NOT NULL,
    target_revenue REAL DEFAULT 0,
    target_deals INTEGER DEFAULT 0,
    target_meetings INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignee_user_id, period_month, period_year)
  );
`);

// ── Etapa 6: tabelas de cadências ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_cadences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    trigger_stage TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crm_cadence_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cadence_id INTEGER NOT NULL,
    step_order INTEGER NOT NULL DEFAULT 0,
    wait_amount INTEGER NOT NULL DEFAULT 1,
    wait_unit TEXT NOT NULL DEFAULT 'days',
    message_template TEXT NOT NULL,
    skip_if_replied INTEGER DEFAULT 1,
    FOREIGN KEY (cadence_id) REFERENCES crm_cadences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_cadence_steps_order ON crm_cadence_steps(cadence_id, step_order);

  CREATE TABLE IF NOT EXISTS crm_cadence_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    cadence_id INTEGER NOT NULL,
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    next_step_at DATETIME,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lead_id, cadence_id),
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
    FOREIGN KEY (cadence_id) REFERENCES crm_cadences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_next ON crm_cadence_enrollments(status, next_step_at);
`);

// ── Etapa 5: tabelas de IA ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_lead_ai (
    lead_id INTEGER PRIMARY KEY,
    score INTEGER DEFAULT 0,
    score_reason TEXT,
    next_step_text TEXT,
    next_step_action TEXT,
    conversation_summary TEXT,
    hot_signals_json TEXT,
    last_updated_at DATETIME,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS crm_ai_learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lead_id INTEGER,
    outcome TEXT NOT NULL,
    lesson TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Cria usuário admin padrão se não existir
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('admin123', salt, 64).toString('hex');
  db.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)").run(`${salt}:${hash}`);
  console.log('[DB] Usuário admin criado (senha: admin123)');
} else {
  // Garante que o admin existente tem is_admin = 1
  db.prepare("UPDATE users SET is_admin = 1 WHERE username = 'admin'").run();
}

// Adiciona colunas opcionais via ALTER TABLE (idempotente)
try { db.exec("ALTER TABLE crm_followups ADD COLUMN push_notified INTEGER DEFAULT NULL"); } catch {}

// Etapa 11 — message snippets
db.exec(`
  CREATE TABLE IF NOT EXISTS message_snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    shortcut    TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    category    TEXT    DEFAULT 'geral',
    uses_count  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, shortcut)
  );
`);

// Etapa 9 — PWA push notifications
db.exec(`
  CREATE TABLE IF NOT EXISTS push_config (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    public_key  TEXT NOT NULL,
    private_key TEXT NOT NULL,
    subject     TEXT NOT NULL DEFAULT 'mailto:admin@example.com',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
  );
`);

// Gera VAPID keys na primeira execução
try {
  const webpush = require('web-push');
  const existing = db.prepare('SELECT id FROM push_config WHERE id = 1').get();
  if (!existing) {
    const keys = webpush.generateVAPIDKeys();
    db.prepare('INSERT INTO push_config (id, public_key, private_key) VALUES (1, ?, ?)')
      .run(keys.publicKey, keys.privateKey);
    console.log('[DB] VAPID keys geradas para push notifications');
  }
} catch (e) {
  console.warn('[DB] web-push não disponível — push notifications desativadas:', e.message);
}

// Etapa 8 — filtros salvos do Kanban
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_lead_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Etapa 12 — Audit log + API keys + outbound webhooks
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    entity_type TEXT    NOT NULL,
    entity_id   INTEGER,
    action      TEXT    NOT NULL,
    before_json TEXT,
    after_json  TEXT,
    ip          TEXT,
    at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    key_hash    TEXT    NOT NULL UNIQUE,
    key_prefix  TEXT    NOT NULL,
    scopes      TEXT    DEFAULT 'leads:read',
    last_used_at DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at  DATETIME
  );

  CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    url         TEXT    NOT NULL,
    events      TEXT    NOT NULL DEFAULT 'lead.created,stage.changed,proposal.sent',
    secret      TEXT,
    active      INTEGER DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Adiciona coluna role em users (idempotente)
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'seller'"); } catch {}
// Garante que admin tem role = 'admin'
try { db.exec("UPDATE users SET role = 'admin' WHERE is_admin = 1"); } catch {}

// ═══════════════════════════════════════════════════════════════════════
// ONDA 1 — ETAPA 0: Fundação Multi-Tenant
// Prepara o sistema para virar SaaS sem refactor futuro.
// Tudo que existe hoje migra silenciosamente pra org_id = 1.
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    slug        TEXT    UNIQUE,
    plan        TEXT    DEFAULT 'free',
    settings_json TEXT  DEFAULT '{}',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Cria org default "Mauro Marketing" (id = 1) se não existir
const defaultOrg = db.prepare('SELECT id FROM organizations WHERE id = 1').get();
if (!defaultOrg) {
  db.prepare("INSERT INTO organizations (id, name, slug, plan) VALUES (1, 'Mauro Marketing', 'mauro', 'enterprise')").run();
  console.log('[DB] Organização padrão "Mauro Marketing" criada (id=1)');
}

// Adiciona org_id (default 1) em todas as tabelas core, idempotente
const ORG_TABLES = [
  'users',
  'crm_leads',
  'crm_cadences',
  'crm_cadence_enrollments',
  'message_snippets',
  'crm_proposals',
  'crm_meetings',
  'crm_followups',
  'crm_tasks',
  'crm_tags',
  'crm_lead_filters',
  'crm_lead_ai',
  'crm_ai_learnings',
  'crm_goals',
  'audit_log',
  'api_keys',
  'webhook_endpoints',
  'push_subscriptions',
];
for (const tbl of ORG_TABLES) {
  try {
    db.exec(`ALTER TABLE ${tbl} ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id)`);
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
// ONDA 1 — Feature: Settings de notificação por WhatsApp
// User pode configurar número pessoal pra receber resumos/alertas
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id              INTEGER PRIMARY KEY,
    org_id               INTEGER NOT NULL DEFAULT 1,
    notification_phone   TEXT,
    rescue_enabled       INTEGER DEFAULT 1,
    rescue_time          TEXT    DEFAULT '08:00',
    rescue_via_whatsapp  INTEGER DEFAULT 1,
    rescue_via_push      INTEGER DEFAULT 1,
    rescue_max_items     INTEGER DEFAULT 10,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ═══════════════════════════════════════════════════════════════════════
// ONDA 1 — Feature 1: Resgatador Diário
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_daily_rescues (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id            INTEGER NOT NULL DEFAULT 1,
    user_id           INTEGER NOT NULL,
    lead_id           INTEGER NOT NULL,
    rescue_date       TEXT    NOT NULL,
    priority          INTEGER NOT NULL DEFAULT 50,
    reason            TEXT    NOT NULL,
    suggested_action  TEXT,
    suggested_message TEXT,
    status            TEXT    DEFAULT 'pending',
    dismissed_at      DATETIME,
    acted_at          DATETIME,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, lead_id, rescue_date)
  );
  CREATE INDEX IF NOT EXISTS idx_rescues_user_date ON crm_daily_rescues (user_id, rescue_date);
  CREATE INDEX IF NOT EXISTS idx_rescues_lead     ON crm_daily_rescues (lead_id);
`);

// ═══════════════════════════════════════════════════════════════════════
// ONDA 1 — Feature 2: Re-engajamento Inteligente
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_reengagement_attempts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id            INTEGER NOT NULL DEFAULT 1,
    user_id           INTEGER NOT NULL,
    lead_id           INTEGER NOT NULL,
    cooling_reason    TEXT,
    message_sent      TEXT,
    sent_at           DATETIME,
    responded         INTEGER DEFAULT 0,
    responded_at      DATETIME,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_reengage_lead ON crm_reengagement_attempts (lead_id);
`);

// Adiciona campos relacionados ao resgate em crm_leads (idempotente)
try { db.exec("ALTER TABLE crm_leads ADD COLUMN cooling_reason TEXT"); } catch {}
try { db.exec("ALTER TABLE crm_leads ADD COLUMN dormant_until DATETIME"); } catch {}
try { db.exec("ALTER TABLE crm_leads ADD COLUMN hot_recovery_at DATETIME"); } catch {}
try { db.exec("ALTER TABLE crm_leads ADD COLUMN last_reengagement_at DATETIME"); } catch {}

// ═══════════════════════════════════════════════════════════════════════
// ONDA 1 — Feature 6: Streak & métricas pessoais
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS user_metrics_daily (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id                      INTEGER NOT NULL DEFAULT 1,
    user_id                     INTEGER NOT NULL,
    metric_date                 TEXT    NOT NULL,
    avg_response_minutes        REAL,
    followups_done              INTEGER DEFAULT 0,
    leads_resgatados            INTEGER DEFAULT 0,
    leads_perdidos_por_timing   INTEGER DEFAULT 0,
    hot_recovery_responded_fast INTEGER DEFAULT 0,
    hot_recovery_total          INTEGER DEFAULT 0,
    created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, metric_date)
  );

  CREATE TABLE IF NOT EXISTS user_streaks (
    user_id           INTEGER PRIMARY KEY,
    org_id            INTEGER NOT NULL DEFAULT 1,
    current_streak    INTEGER DEFAULT 0,
    longest_streak    INTEGER DEFAULT 0,
    last_increment_at TEXT,
    last_broken_at    DATETIME
  );
`);

// ─── Onda 1 F6: colunas extras para user_metrics_daily e user_streaks ────────
const metricsExtras = [
  "ALTER TABLE user_metrics_daily ADD COLUMN messages_sent INTEGER DEFAULT 0",
  "ALTER TABLE user_metrics_daily ADD COLUMN leads_created INTEGER DEFAULT 0",
  "ALTER TABLE user_metrics_daily ADD COLUMN deals_closed  INTEGER DEFAULT 0",
  "ALTER TABLE user_streaks ADD COLUMN last_active_date TEXT",
];
for (const sql of metricsExtras) {
  try { db.exec(sql); } catch {}
}

// ─── F3: Seed de cadências de resgate (templates pré-prontos) ────────────────
// Só insere se ainda não há cadências do sistema (user_id = 0 = sistema)
const hasRescueCadences = db.prepare("SELECT COUNT(*) AS c FROM crm_cadences WHERE user_id = 0").get()?.c || 0;
if (!hasRescueCadences) {
  const rescueCadences = [
    {
      name: '🏃 Sumiu na Qualificação',
      desc: 'Para leads que pararam de responder durante diagnóstico/conversando',
      trigger: 'conversando',
      steps: [
        { order: 1, wait: 2, unit: 'days', msg: 'Oi {nome}! Vi que nossa conversa ficou no ar. Posso te fazer só 1 pergunta rápida?' },
        { order: 2, wait: 3, unit: 'days', msg: '{nome}, entendo que o dia a dia é corrido. Me fala em 1 linha: o que te impede de avançar nisso hoje?' },
        { order: 3, wait: 5, unit: 'days', msg: 'Última tentativa, {nome} — se não for o momento certo, tudo bem. Me fala quando fizer mais sentido!' },
      ]
    },
    {
      name: '📋 Sumiu Após Proposta',
      desc: 'Para leads que receberam proposta e pararam de responder',
      trigger: 'proposta_enviada',
      steps: [
        { order: 1, wait: 2, unit: 'days', msg: 'Oi {nome}! Você teve chance de ver a proposta que enviei? Tem alguma dúvida que posso esclarecer?' },
        { order: 2, wait: 4, unit: 'days', msg: '{nome}, queria entender o que está travando a decisão. Posso ajustar algo na proposta?' },
        { order: 3, wait: 7, unit: 'days', msg: 'Oi {nome}! A proposta ainda é válida. Só me confirme se ainda faz sentido pra você.' },
      ]
    },
    {
      name: '🤝 Pós-Reunião Sem Retorno',
      desc: 'Para leads que fizeram reunião mas não responderam depois',
      trigger: 'reuniao_realizada',
      steps: [
        { order: 1, wait: 1, unit: 'days', msg: '{nome}, foi um prazer conversar! Fica à vontade pra mandar qualquer dúvida que surgir.' },
        { order: 2, wait: 3, unit: 'days', msg: 'Oi {nome}! Alguma atualização de lá? Queria saber se o que discutimos fez sentido.' },
        { order: 3, wait: 5, unit: 'days', msg: '{nome}, tô aqui se quiser retomar. O que você precisa pra dar o próximo passo?' },
      ]
    },
    {
      name: '💸 Pediu Desconto e Sumiu',
      desc: 'Lead negociou desconto mas parou de responder',
      trigger: 'negociacao',
      steps: [
        { order: 1, wait: 2, unit: 'days', msg: 'Oi {nome}! Em relação ao que conversamos sobre valores, consegui uma condição especial pra você. Posso te contar?' },
        { order: 2, wait: 4, unit: 'days', msg: '{nome}, sei que orçamento é sempre um ponto sensível. O que seria necessário pra fechar ainda esse mês?' },
        { order: 3, wait: 6, unit: 'days', msg: 'Última vez que passo por aqui, {nome}. A condição especial vence em breve — quer aproveitar?' },
      ]
    },
    {
      name: '🤔 Disse "Vou Pensar"',
      desc: 'Lead disse que vai pensar e sumiu',
      trigger: 'analisando_proposta',
      steps: [
        { order: 1, wait: 3, unit: 'days', msg: 'Oi {nome}! Já teve tempo de pensar? Posso tirar alguma dúvida?' },
        { order: 2, wait: 5, unit: 'days', msg: '{nome}, o que ainda falta pra você sentir confiança pra seguir em frente?' },
        { order: 3, wait: 7, unit: 'days', msg: 'Oi {nome}! Entendo que a decisão é sua. Mas queria saber — ainda faz sentido pra você?' },
      ]
    },
  ];

  for (const c of rescueCadences) {
    try {
      const info = db.prepare(`
        INSERT INTO crm_cadences (user_id, org_id, name, description, trigger_stage, active)
        VALUES (0, 1, ?, ?, ?, 1)
      `).run(c.name, c.desc, c.trigger);
      const cadenceId = info.lastInsertRowid;
      for (const s of c.steps) {
        db.prepare(`
          INSERT INTO crm_cadence_steps (cadence_id, step_order, wait_amount, wait_unit, message_template, skip_if_replied)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(cadenceId, s.order, s.wait, s.unit, s.msg);
      }
    } catch (e) {
      console.warn('[DB Seed] Erro ao criar cadência de resgate:', e.message);
    }
  }
  console.log('[DB] 5 cadências de resgate pré-prontas criadas');
}

// Seed user_settings pra usuários que ainda não têm (com o seu número padrão)
const usersWithoutSettings = db.prepare(`
  SELECT u.id FROM users u
  LEFT JOIN user_settings s ON s.user_id = u.id
  WHERE s.user_id IS NULL
`).all();
for (const u of usersWithoutSettings) {
  // Admin/Mauro recebe seu número como padrão; demais ficam vazios
  const phone = u.id === 1 ? '5517996596363' : null;
  db.prepare(`
    INSERT INTO user_settings (user_id, org_id, notification_phone, rescue_enabled, rescue_via_whatsapp, rescue_via_push)
    VALUES (?, 1, ?, 1, 1, 1)
  `).run(u.id, phone);
}

// ═══════════════════════════════════════════════════════════════════════
// ONDA 2 — AI First Responder + AI SDR
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_auto_responder_config (
    user_id              INTEGER PRIMARY KEY,
    org_id               INTEGER NOT NULL DEFAULT 1,
    enabled              INTEGER DEFAULT 0,
    max_auto_msgs        INTEGER DEFAULT 3,
    persona              TEXT    DEFAULT '',
    objectives           TEXT    DEFAULT '',
    response_delay_secs  INTEGER DEFAULT 5,
    handoff_message      TEXT    DEFAULT '',
    sdr_enabled          INTEGER DEFAULT 0,
    sdr_goal             TEXT    DEFAULT 'Agendar uma reunião de 15 minutos',
    sdr_calendar_link    TEXT    DEFAULT '',
    sdr_max_attempts     INTEGER DEFAULT 5,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Adiciona coluna auto_response em crm_message_log (0 = humano, 1 = first responder, 2 = SDR)
try { db.exec("ALTER TABLE crm_message_log ADD COLUMN auto_response INTEGER DEFAULT 0"); } catch {}

// ═══════════════════════════════════════════════════════════════════════
// ONDA 3 — Conversation Intelligence
// Coaching Cards + Battle Cards
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_coaching_cards (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id       INTEGER NOT NULL DEFAULT 1,
    user_id      INTEGER NOT NULL,
    lead_id      INTEGER,
    type         TEXT NOT NULL DEFAULT 'general',
    emoji        TEXT DEFAULT '💡',
    title        TEXT NOT NULL,
    insight      TEXT NOT NULL,
    action       TEXT,
    score        INTEGER,
    source       TEXT DEFAULT 'ai',
    dismissed_at DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_coaching_user ON crm_coaching_cards(user_id, dismissed_at, created_at);

  CREATE TABLE IF NOT EXISTS crm_battle_cards (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL DEFAULT 1,
    user_id          INTEGER NOT NULL,
    category         TEXT DEFAULT 'objeção',
    objection        TEXT NOT NULL,
    response         TEXT NOT NULL,
    tips             TEXT,
    trigger_keywords TEXT DEFAULT '[]',
    uses_count       INTEGER DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_battle_cards_user ON crm_battle_cards(user_id);
`);

// ═══════════════════════════════════════════════════════════════════════
// ONDA 4 — CSV Import + Outbound Campaigns
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_lead_imports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id      INTEGER NOT NULL DEFAULT 1,
    user_id     INTEGER NOT NULL,
    filename    TEXT,
    total_rows  INTEGER DEFAULT 0,
    imported    INTEGER DEFAULT 0,
    skipped     INTEGER DEFAULT 0,
    errors      INTEGER DEFAULT 0,
    status      TEXT    DEFAULT 'done',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crm_outbound_campaigns (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id              INTEGER NOT NULL DEFAULT 1,
    user_id             INTEGER NOT NULL,
    name                TEXT NOT NULL,
    template            TEXT NOT NULL,
    target_filters_json TEXT DEFAULT '{}',
    ai_personalize      INTEGER DEFAULT 0,
    delay_seconds       INTEGER DEFAULT 10,
    status              TEXT DEFAULT 'draft',
    total_leads         INTEGER DEFAULT 0,
    sent                INTEGER DEFAULT 0,
    failed              INTEGER DEFAULT 0,
    started_at          DATETIME,
    finished_at         DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crm_outbound_jobs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id         INTEGER NOT NULL,
    lead_id             INTEGER NOT NULL,
    personalized_msg    TEXT,
    status              TEXT DEFAULT 'pending',
    sent_at             DATETIME,
    wa_msg_id           TEXT,
    error_msg           TEXT,
    FOREIGN KEY (campaign_id) REFERENCES crm_outbound_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id)     REFERENCES crm_leads(id)              ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_outbound_jobs_campaign ON crm_outbound_jobs(campaign_id, status);
`);

// ═══════════════════════════════════════════════════════════════════════
// ONDA 5 — Lead Distribution + Commissions
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_distribution_config (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id               INTEGER NOT NULL DEFAULT 1,
    owner_user_id        INTEGER NOT NULL UNIQUE,
    enabled              INTEGER DEFAULT 0,
    strategy             TEXT    DEFAULT 'round_robin',
    max_leads_per_seller INTEGER DEFAULT 50,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crm_distribution_members (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL DEFAULT 1,
    owner_user_id    INTEGER NOT NULL,
    member_user_id   INTEGER NOT NULL,
    active           INTEGER DEFAULT 1,
    last_assigned_at DATETIME,
    total_assigned   INTEGER DEFAULT 0,
    UNIQUE(owner_user_id, member_user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_dist_members_owner ON crm_distribution_members(owner_user_id, active);

  CREATE TABLE IF NOT EXISTS crm_commission_config (
    user_id    INTEGER PRIMARY KEY,
    org_id     INTEGER NOT NULL DEFAULT 1,
    percentage REAL    DEFAULT 5.0,
    active     INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS crm_commissions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL DEFAULT 1,
    user_id          INTEGER NOT NULL,
    lead_id          INTEGER NOT NULL,
    deal_value       REAL NOT NULL,
    percentage       REAL NOT NULL,
    commission_value REAL NOT NULL,
    status           TEXT DEFAULT 'pending',
    paid_at          DATETIME,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_commissions_user ON crm_commissions(user_id, status, created_at);
`);

// Seed de battle cards padrão (user_id = 0 = sistema)
const hasBattleCards = db.prepare("SELECT COUNT(*) AS c FROM crm_battle_cards WHERE user_id = 0").get()?.c || 0;
if (!hasBattleCards) {
  const defaultCards = [
    { cat: 'preço',     obj: '"Tá muito caro"',               resp: 'Entendo! Comparado com o que especificamente? Posso te mostrar o retorno que outros clientes tiveram. Qual é o maior valor que você vê na solução?',                           tips: 'Redirecione para valor, não preço. Pergunte com o que está comparando.', keys: '["caro","preço","valor","orçamento","investimento"]' },
    { cat: 'tempo',     obj: '"Vou pensar"',                   resp: 'Claro! O que especificamente você precisa pensar? Posso ajudar a esclarecer agora mesmo. Tem algo que ficou sem resposta?',                                                      tips: 'Identifique a objeção real por trás do "vou pensar".', keys: '["pensar","decidir","depois","semana que vem"]' },
    { cat: 'tempo',     obj: '"Não tenho tempo agora"',        resp: 'Entendo que o tempo é precioso! Por isso tenho uma apresentação de exatos 15 minutos que vai te mostrar como economizar X horas por semana. Qual dia funciona melhor?',         tips: 'Mostre que você vai economizar mais tempo do que vai gastar.', keys: '["tempo","ocupado","agora não","depois"]' },
    { cat: 'autoridade',obj: '"Preciso consultar meu sócio"',  resp: 'Faz todo sentido! Seria possível fazermos uma reunião rápida com os dois juntos? Assim consigo responder todas as dúvidas de uma vez e vocês podem decidir na hora.',           tips: 'Ofereça incluir o decisor na próxima reunião.', keys: '["sócio","diretor","chefe","aprovar","decisão"]' },
    { cat: 'urgência',  obj: '"Não é prioridade agora"',       resp: 'Entendo! Me ajuda a entender: o que precisa acontecer para virar prioridade? E qual o custo de não resolver isso nos próximos 3 meses?',                                       tips: 'Ajude o cliente a calcular o custo da inação.', keys: '["prioridade","urgência","não é hora","mais tarde"]' },
    { cat: 'confiança', obj: '"Não te conheço ainda"',         resp: 'Faz sentido! Por isso quero te mostrar casos de clientes similares ao seu negócio. Qual empresa parecida com a sua você admiraria como referência?',                           tips: 'Use prova social de clientes do mesmo segmento.', keys: '["referência","conhecer","confiança","quem são"]' },
    { cat: 'concorrência', obj: '"Já uso o concorrente X"',   resp: 'Legal! O que você mais gosta no X? E tem algo que você gostaria que fosse diferente? Muitos dos nossos clientes vieram do X e notaram [diferencial principal].',              tips: 'Identifique o ponto de dor com o concorrente antes de comparar.', keys: '["concorrente","outro sistema","já tenho","já uso"]' },
    { cat: 'preço',     obj: '"Me dá desconto"',               resp: 'Posso verificar o que consigo fazer! Me ajuda a entender: se eu conseguir uma condição especial, você fecha ainda essa semana?',                                                tips: 'Condicione o desconto ao fechamento imediato.', keys: '["desconto","condição","negociar","reduzir","preço melhor"]' },
    { cat: 'urgência',  obj: '"Vou esperar o próximo mês"',    resp: 'O que muda no próximo mês? Só pra eu entender se tem algo que eu possa adiantar para você. Cada mês sem resolver isso custa [valor do problema].',                            tips: 'Questione o motivo real do delay e calcule o custo da espera.', keys: '["próximo mês","depois","esperar","não agora"]' },
    { cat: 'produto',   obj: '"Não sei se atende meu caso"',   resp: 'Ótima pergunta! Me conta mais sobre o seu caso específico — tenho quase certeza que já resolvemos algo parecido. Qual é a sua maior dor hoje?',                              tips: 'Faça perguntas para descobrir o caso de uso específico.', keys: '["funciona","atende","meu caso","diferente","específico"]' },
  ];
  const stmt = db.prepare(`
    INSERT INTO crm_battle_cards (user_id, org_id, category, objection, response, tips, trigger_keywords)
    VALUES (0, 1, ?, ?, ?, ?, ?)
  `);
  for (const c of defaultCards) {
    try { stmt.run(c.cat, c.obj, c.resp, c.tips, c.keys); } catch {}
  }
  console.log('[DB] 10 battle cards padrão criados');
}

// ═══════════════════════════════════════════════════════════════════════
// ONDA 7 — Metas Pessoais + Alertas Inteligentes
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_personal_goals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL,
    org_id            INTEGER NOT NULL DEFAULT 1,
    period            TEXT    NOT NULL,
    target_revenue    REAL    DEFAULT 0,
    target_deals      INTEGER DEFAULT 0,
    target_meetings   INTEGER DEFAULT 0,
    target_followups  INTEGER DEFAULT 0,
    target_new_leads  INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, period)
  );

  CREATE TABLE IF NOT EXISTS crm_alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    org_id       INTEGER NOT NULL DEFAULT 1,
    type         TEXT NOT NULL,
    title        TEXT NOT NULL,
    body         TEXT,
    entity_type  TEXT,
    entity_id    INTEGER,
    priority     TEXT DEFAULT 'normal',
    read_at      DATETIME,
    dismissed_at DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_user ON crm_alerts(user_id, read_at, dismissed_at, created_at);
`);

// ═══════════════════════════════════════════════════════════════════════
// ONDA 6 — Integração nativa Tickfy ↔ CRM
// ═══════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_tickfy_integration (
    user_id         INTEGER PRIMARY KEY,
    org_id          INTEGER NOT NULL DEFAULT 1,
    enabled         INTEGER DEFAULT 0,
    sync_statuses   TEXT    DEFAULT '["PG"]',
    default_stage   TEXT    DEFAULT 'entrou_contato',
    default_tag     TEXT    DEFAULT 'Tickfy',
    tag_with_event  INTEGER DEFAULT 1,
    create_note     INTEGER DEFAULT 1,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crm_tickfy_lead_sync (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    sale_id     INTEGER NOT NULL,
    lead_id     INTEGER,
    phone       TEXT,
    evento      TEXT,
    valor       REAL,
    status_code TEXT,
    action      TEXT DEFAULT 'created',
    synced_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sale_id)
  );
  CREATE INDEX IF NOT EXISTS idx_tickfy_sync_user ON crm_tickfy_lead_sync(user_id, synced_at);
`);

module.exports = db;
module.exports.insertDefaultCategories = insertDefaultCategories;
module.exports.ensureCrmSeeds = ensureCrmSeeds;
module.exports.DEFAULT_CRM_TEMPLATES = DEFAULT_CRM_TEMPLATES;
module.exports.DEFAULT_BUSINESS_HOURS = DEFAULT_BUSINESS_HOURS;

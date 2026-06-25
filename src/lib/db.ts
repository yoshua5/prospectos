import { createClient, type InArgs } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:data/prospectos.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize tables
const initSQL = `
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    website TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    social TEXT,
    service TEXT,
    keywords TEXT,
    owner TEXT DEFAULT '',
    phone_type TEXT DEFAULT '',
    status TEXT DEFAULT 'nuevo',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    logo_url TEXT DEFAULT '',
    header_color TEXT DEFAULT '#f97316',
    cta_text TEXT DEFAULT '',
    cta_url TEXT DEFAULT '',
    sig_name TEXT DEFAULT '',
    sig_title TEXT DEFAULT '',
    sig_phone TEXT DEFAULT '',
    sig_company TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template_id INTEGER,
    leads_json TEXT DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    sent_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS smtp_config (
    id INTEGER PRIMARY KEY,
    host TEXT,
    port INTEGER,
    user TEXT,
    pass TEXT,
    from_name TEXT,
    from_email TEXT
  );
`;

let initialized = false;
async function ensureInit() {
  if (initialized) return;
  await client.executeMultiple(initSQL);
  // Migrate templates columns
  const cols = await client.execute("PRAGMA table_info(templates)");
  const existing = cols.rows.map(r => r[1] as string);
  const newCols: Record<string, string> = {
    logo_url: "TEXT DEFAULT ''",
    header_color: "TEXT DEFAULT '#f97316'",
    cta_text: "TEXT DEFAULT ''",
    cta_url: "TEXT DEFAULT ''",
    sig_name: "TEXT DEFAULT ''",
    sig_title: "TEXT DEFAULT ''",
    sig_phone: "TEXT DEFAULT ''",
    sig_company: "TEXT DEFAULT ''",
  };
  for (const [col, def] of Object.entries(newCols)) {
    if (!existing.includes(col)) {
      await client.execute(`ALTER TABLE templates ADD COLUMN ${col} ${def}`);
    }
  }
  // Migrate leads columns
  const leadCols = await client.execute("PRAGMA table_info(leads)");
  const existingLeadCols = leadCols.rows.map(r => r[1] as string);
  const newLeadCols: Record<string, string> = {
    owner: "TEXT DEFAULT ''",
    phone_type: "TEXT DEFAULT ''",
  };
  for (const [col, def] of Object.entries(newLeadCols)) {
    if (!existingLeadCols.includes(col)) {
      await client.execute(`ALTER TABLE leads ADD COLUMN ${col} ${def}`);
    }
  }
  initialized = true;
}

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  await ensureInit();
  const result = await client.execute({ sql, args });
  return result.rows as unknown as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | null> {
  await ensureInit();
  const result = await client.execute({ sql, args });
  return (result.rows[0] as unknown as T) ?? null;
}

export async function execute(sql: string, args: InArgs = []): Promise<{ lastInsertRowid: number }> {
  await ensureInit();
  const result = await client.execute({ sql, args });
  return { lastInsertRowid: Number(result.lastInsertRowid) };
}

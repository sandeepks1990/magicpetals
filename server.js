const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'magic_petals_secure_secret_1990';

// Hardcoded Admin Credentials
const ADMIN_USER = 'thoma@magicpetals.com';
const ADMIN_PASS = 'Thoma@1990';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// BULLETPROOF IN-MEMORY + CLOUD SYNC STORAGE ENGINE
// -------------------------------------------------------------
const JSONBIN_MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
let JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const DATABASE_URL = process.env.DATABASE_URL;

let memorySubmissions = []; // In-memory fast cache
let storageEngine = 'memory_local';
let pgPool = null;

// Local JSON File Backup path
const localJsonPath = path.join(__dirname, 'submissions_backup.json');

// Initialize local JSON backup if exists
if (fs.existsSync(localJsonPath)) {
  try {
    const raw = fs.readFileSync(localJsonPath, 'utf8');
    memorySubmissions = JSON.parse(raw);
    console.log(`Loaded ${memorySubmissions.length} records from local JSON backup.`);
  } catch (e) {
    console.error('Error reading local JSON backup:', e);
  }
}

if (JSONBIN_MASTER_KEY) {
  storageEngine = 'jsonbin';
  console.log('☁️ Active Storage Engine: JSONBin.io Cloud Storage');
  // Initial sync from JSONBin
  syncFromJSONBin();
} else if (DATABASE_URL) {
  storageEngine = 'postgres';
  console.log('🐘 Active Storage Engine: PostgreSQL');
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(255) NOT NULL,
      feedback TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).then(() => syncFromPostgres())
    .catch(err => console.error('Postgres init error:', err));
} else {
  console.log('💡 Active Storage Engine: In-Memory + Local JSON Backup');
}

// -------------------------------------------------------------
// JSONBin.io Operations
// -------------------------------------------------------------
async function ensureJsonBinContainer() {
  if (JSONBIN_BIN_ID) return JSONBIN_BIN_ID;
  if (!JSONBIN_MASTER_KEY) return null;

  try {
    const res = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY,
        'X-Bin-Name': 'magicpetals_submissions',
        'X-Bin-Private': 'true'
      },
      body: JSON.stringify(memorySubmissions)
    });
    const data = await res.json();
    if (data.metadata && data.metadata.id) {
      JSONBIN_BIN_ID = data.metadata.id;
      console.log(`Created new JSONBin Container: ${JSONBIN_BIN_ID}`);
      return JSONBIN_BIN_ID;
    }
  } catch (err) {
    console.error('Failed to create JSONBin container:', err);
  }
  return null;
}

async function syncFromJSONBin() {
  if (!JSONBIN_MASTER_KEY) return;
  try {
    const binId = await ensureJsonBinContainer();
    if (!binId) return;

    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_MASTER_KEY }
    });
    const data = await res.json();
    if (Array.isArray(data.record)) {
      memorySubmissions = data.record;
      console.log(`Synced ${memorySubmissions.length} records from JSONBin.io`);
      saveLocalJsonBackup();
    }
  } catch (err) {
    console.error('JSONBin sync error:', err);
  }
}

async function syncToJSONBin() {
  if (!JSONBIN_MASTER_KEY) return;
  try {
    const binId = await ensureJsonBinContainer();
    if (!binId) return;

    await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(memorySubmissions)
    });
    console.log('Saved records to JSONBin.io cloud.');
  } catch (err) {
    console.error('Failed pushing to JSONBin:', err);
  }
}

// -------------------------------------------------------------
// PostgreSQL Operations
// -------------------------------------------------------------
async function syncFromPostgres() {
  try {
    const res = await pgPool.query('SELECT id, name, phone, feedback, created_at FROM submissions ORDER BY id DESC');
    memorySubmissions = res.rows;
    console.log(`Synced ${memorySubmissions.length} records from PostgreSQL.`);
    saveLocalJsonBackup();
  } catch (err) {
    console.error('Postgres sync error:', err);
  }
}

function saveLocalJsonBackup() {
  try {
    fs.writeFileSync(localJsonPath, JSON.stringify(memorySubmissions, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing local JSON backup:', e);
  }
}

// -------------------------------------------------------------
// Core Business Operations (Memory First + Background Cloud Sync)
// -------------------------------------------------------------
async function addSubmission(name, phone, feedback) {
  const newId = memorySubmissions.length > 0 
    ? Math.max(...memorySubmissions.map(r => Number(r.id) || 0)) + 1 
    : 1;

  const nowISO = new Date().toISOString();
  const record = {
    id: newId,
    name: name.trim(),
    phone: phone.trim(),
    feedback: feedback ? feedback.trim() : '',
    created_at: nowISO
  };

  // 1. Immediately insert into memory array so Admin sees it in 0ms
  memorySubmissions.unshift(record);
  saveLocalJsonBackup();

  // 2. Sync to cloud database asynchronously
  if (storageEngine === 'jsonbin') {
    syncToJSONBin();
  } else if (storageEngine === 'postgres' && pgPool) {
    pgPool.query(
      'INSERT INTO submissions (name, phone, feedback) VALUES ($1, $2, $3)',
      [record.name, record.phone, record.feedback]
    ).catch(err => console.error('Postgres insert error:', err));
  }

  return newId;
}

function getSubmissions(search, sort) {
  let records = [...memorySubmissions];

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    records = records.filter(r => 
      (r.name && r.name.toLowerCase().includes(term)) ||
      (r.phone && r.phone.toLowerCase().includes(term)) ||
      (r.feedback && r.feedback.toLowerCase().includes(term))
    );
  }

  if (sort === 'oldest') {
    records.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else {
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = records.filter(r => r.created_at && r.created_at.startsWith(todayStr)).length;

  return {
    records,
    stats: {
      total: records.length,
      today: todayCount
    }
  };
}

async function deleteSubmission(id) {
  const targetId = Number(id);
  const initialLen = memorySubmissions.length;
  memorySubmissions = memorySubmissions.filter(r => Number(r.id) !== targetId);
  
  if (memorySubmissions.length < initialLen) {
    saveLocalJsonBackup();
    if (storageEngine === 'jsonbin') {
      syncToJSONBin();
    } else if (storageEngine === 'postgres' && pgPool) {
      pgPool.query('DELETE FROM submissions WHERE id = $1', [targetId])
        .catch(err => console.error('Postgres delete error:', err));
    }
    return true;
  }
  return false;
}

// Token Verification Middleware
function verifyAdminToken(req, res, next) {
  let token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
  if (!token && req.query.token) token = req.query.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. Authorization token missing.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.username !== ADMIN_USER) {
      return res.status(403).json({ success: false, message: 'Invalid permissions.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// -------------------------------------------------------------
// PUBLIC API ENDPOINTS
// -------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    store: 'Magic Petals - Pets Food & Stationery',
    engine: storageEngine,
    jsonbinKeyConfigured: !!JSONBIN_MASTER_KEY,
    totalRecordsInMemory: memorySubmissions.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/submissions', async (req, res) => {
  try {
    const { name, phone, feedback } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required.' });
    if (!phone || !phone.trim()) return res.status(400).json({ success: false, message: 'Phone number is required.' });

    const id = await addSubmission(name.trim(), phone.trim(), feedback ? feedback.trim() : '');

    res.status(201).json({
      success: true,
      message: 'Thank you! Your details have been submitted to Magic Petals.',
      id
    });
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({ success: false, message: 'Internal server error while saving details.' });
  }
});

// -------------------------------------------------------------
// ADMIN API ENDPOINTS
// -------------------------------------------------------------

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required.' });

  if (username.trim() === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username: ADMIN_USER }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ success: true, message: 'Login successful!', token, user: { username: ADMIN_USER } });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
});

app.get('/api/admin/submissions', verifyAdminToken, (req, res) => {
  try {
    const { search, sort } = req.query;
    const { records, stats } = getSubmissions(search, sort);
    res.json({ success: true, data: records, stats });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ success: false, message: 'Error retrieving submissions.' });
  }
});

app.delete('/api/admin/submissions/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteSubmission(id);
    if (deleted) {
      res.json({ success: true, message: 'Submission deleted successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Record not found.' });
    }
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ success: false, message: 'Failed to delete submission.' });
  }
});

app.get('/api/admin/export', verifyAdminToken, (req, res) => {
  try {
    const { records } = getSubmissions('', 'newest');
    let csv = 'ID,Name,Phone Number,Feedback / Message,Date & Time\n';

    records.forEach(row => {
      const name = `"${(row.name || '').replace(/"/g, '""')}"`;
      const phone = `"${(row.phone || '').replace(/"/g, '""')}"`;
      const feedback = `"${(row.feedback || '').replace(/"/g, '""')}"`;
      const createdAt = `"${(new Date(row.created_at).toISOString() || '').replace(/"/g, '""')}"`;

      csv += `${row.id},${name},${phone},${feedback},${createdAt}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="magic_petals_customers.csv"');
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).send('Error generating CSV export.');
  }
});

// HTML page routing fallbacks
app.get('/scanner', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scanner.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start Server
app.listen(PORT, () => {
  console.log(`🌸 Magic Petals App is running on http://localhost:${PORT}`);
});

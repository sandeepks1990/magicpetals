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
// TRIPLE DATABASE ADAPTER (JSONBin Cloud JSON, PostgreSQL, SQLite)
// -------------------------------------------------------------
const JSONBIN_MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
let JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const DATABASE_URL = process.env.DATABASE_URL;

let storageMode = 'sqlite';
let pgPool = null;
let sqliteDb = null;

if (JSONBIN_MASTER_KEY) {
  storageMode = 'jsonbin';
  console.log('☁️ Storage Engine: JSONBin.io Cloud JSON');
} else if (DATABASE_URL) {
  storageMode = 'postgres';
  console.log('🐘 Storage Engine: PostgreSQL');
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
  `).catch(err => console.error('Postgres init error:', err));
} else {
  storageMode = 'sqlite';
  console.log('📁 Storage Engine: Local SQLite');
  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  sqliteDb = new Database(dbPath);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// -------------------------------------------------------------
// JSONBin.io Helper Functions
// -------------------------------------------------------------
async function ensureJsonBin() {
  if (JSONBIN_BIN_ID) return JSONBIN_BIN_ID;

  try {
    console.log('Creating initial JSONBin.io container...');
    const res = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY,
        'X-Bin-Name': 'magicpetals_submissions',
        'X-Bin-Private': 'true'
      },
      body: JSON.stringify([])
    });
    const data = await res.json();
    if (data.metadata && data.metadata.id) {
      JSONBIN_BIN_ID = data.metadata.id;
      console.log(`JSONBin container created successfully! Bin ID: ${JSONBIN_BIN_ID}`);
      return JSONBIN_BIN_ID;
    } else {
      console.error('Failed to create JSONBin:', data);
    }
  } catch (err) {
    console.error('JSONBin creation error:', err);
  }
  return null;
}

async function fetchJsonBinRecords() {
  const binId = await ensureJsonBin();
  if (!binId) return [];

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_MASTER_KEY
      }
    });
    const data = await res.json();
    return Array.isArray(data.record) ? data.record : [];
  } catch (err) {
    console.error('Error fetching JSONBin records:', err);
    return [];
  }
}

async function saveJsonBinRecords(records) {
  const binId = await ensureJsonBin();
  if (!binId) return false;

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(records)
    });
    const data = await res.json();
    return res.ok;
  } catch (err) {
    console.error('Error saving to JSONBin:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Unified Database Operations
// -------------------------------------------------------------
async function addSubmission(name, phone, feedback) {
  if (storageMode === 'jsonbin') {
    const records = await fetchJsonBinRecords();
    const newId = records.length > 0 ? Math.max(...records.map(r => r.id || 0)) + 1 : 1;
    const newRecord = {
      id: newId,
      name,
      phone,
      feedback,
      created_at: new Date().toISOString()
    };
    records.unshift(newRecord);
    await saveJsonBinRecords(records);
    return newId;
  } else if (storageMode === 'postgres') {
    const res = await pgPool.query(
      'INSERT INTO submissions (name, phone, feedback) VALUES ($1, $2, $3) RETURNING id',
      [name, phone, feedback]
    );
    return res.rows[0].id;
  } else {
    const stmt = sqliteDb.prepare('INSERT INTO submissions (name, phone, feedback) VALUES (?, ?, ?)');
    const info = stmt.run(name, phone, feedback);
    return info.lastInsertRowid;
  }
}

async function getSubmissions(search, sort) {
  if (storageMode === 'jsonbin') {
    let records = await fetchJsonBinRecords();

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
  } else if (storageMode === 'postgres') {
    let query = 'SELECT id, name, phone, feedback, created_at FROM submissions';
    let params = [];
    if (search && search.trim()) {
      query += ' WHERE name ILIKE $1 OR phone ILIKE $1 OR feedback ILIKE $1';
      params.push(`%${search.trim()}%`);
    }
    query += sort === 'oldest' ? ' ORDER BY created_at ASC' : ' ORDER BY created_at DESC';

    const res = await pgPool.query(query, params);
    const totalRes = await pgPool.query('SELECT COUNT(*) as total FROM submissions');
    const todayRes = await pgPool.query("SELECT COUNT(*) as today FROM submissions WHERE created_at >= CURRENT_DATE");

    return {
      records: res.rows,
      stats: {
        total: parseInt(totalRes.rows[0].total, 10),
        today: parseInt(todayRes.rows[0].today, 10)
      }
    };
  } else {
    let query = 'SELECT * FROM submissions';
    let params = [];
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query += ' WHERE name LIKE ? OR phone LIKE ? OR feedback LIKE ?';
      params.push(searchTerm, searchTerm, searchTerm);
    }
    query += sort === 'oldest' ? ' ORDER BY created_at ASC' : ' ORDER BY created_at DESC';

    const stmt = sqliteDb.prepare(query);
    const records = stmt.all(...params);

    const totalCount = sqliteDb.prepare('SELECT COUNT(*) as total FROM submissions').get().total;
    const todayCount = sqliteDb.prepare("SELECT COUNT(*) as today FROM submissions WHERE date(created_at, 'localtime') = date('now', 'localtime')").get().today;

    return {
      records,
      stats: {
        total: totalCount,
        today: todayCount
      }
    };
  }
}

async function deleteSubmission(id) {
  const targetId = parseInt(id, 10);
  if (storageMode === 'jsonbin') {
    let records = await fetchJsonBinRecords();
    const initialLen = records.length;
    records = records.filter(r => r.id !== targetId);
    if (records.length < initialLen) {
      await saveJsonBinRecords(records);
      return true;
    }
    return false;
  } else if (storageMode === 'postgres') {
    const res = await pgPool.query('DELETE FROM submissions WHERE id = $1', [targetId]);
    return res.rowCount > 0;
  } else {
    const stmt = sqliteDb.prepare('DELETE FROM submissions WHERE id = ?');
    const result = stmt.run(targetId);
    return result.changes > 0;
  }
}

// Admin Token Middleware
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
    engine: storageMode,
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

app.get('/api/admin/submissions', verifyAdminToken, async (req, res) => {
  try {
    const { search, sort } = req.query;
    const { records, stats } = await getSubmissions(search, sort);
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

app.get('/api/admin/export', verifyAdminToken, async (req, res) => {
  try {
    const { records } = await getSubmissions('', 'newest');
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

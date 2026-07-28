const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'magic_petals_secure_secret_1990';

// Hardcoded Admin Credentials as requested
const ADMIN_USER = 'thoma@magicpetals.com';
const ADMIN_PASS = 'Thoma@1990';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// DATABASE DUAL ADAPTER (PostgreSQL on Render OR SQLite local/persistent)
// -------------------------------------------------------------
let usePostgres = !!process.env.DATABASE_URL;
let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
  console.log('🐘 Connecting to PostgreSQL database...');
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Init Postgres Table
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(255) NOT NULL,
      feedback TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).then(() => console.log('PostgreSQL database initialized successfully.'))
    .catch(err => console.error('PostgreSQL init error:', err));
} else {
  console.log('📁 Connecting to SQLite database...');
  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
  
  // Ensure directory exists if custom path provided
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

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
  console.log(`SQLite database initialized at: ${dbPath}`);
}

// Unified Database Access Functions
async function addSubmission(name, phone, feedback) {
  if (usePostgres) {
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
  let query, params = [];
  
  if (usePostgres) {
    query = 'SELECT id, name, phone, feedback, created_at FROM submissions';
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
    query = 'SELECT * FROM submissions';
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
  if (usePostgres) {
    const res = await pgPool.query('DELETE FROM submissions WHERE id = $1', [id]);
    return res.rowCount > 0;
  } else {
    const stmt = sqliteDb.prepare('DELETE FROM submissions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

// Middleware to protect admin routes
function verifyAdminToken(req, res, next) {
  let token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
  if (!token && req.query.token) {
    token = req.query.token;
  }

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    store: 'Magic Petals - Pets Food & Stationery',
    dbEngine: usePostgres ? 'PostgreSQL' : 'SQLite',
    timestamp: new Date().toISOString()
  });
});

// Submit Customer Intake / Feedback Form
app.post('/api/submissions', async (req, res) => {
  try {
    const { name, phone, feedback } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanFeedback = feedback ? feedback.trim() : '';

    const id = await addSubmission(cleanName, cleanPhone, cleanFeedback);

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

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required.' });
  }

  if (username.trim() === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username: ADMIN_USER }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { username: ADMIN_USER }
    });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
});

// Get all submissions (Admin Only)
app.get('/api/admin/submissions', verifyAdminToken, async (req, res) => {
  try {
    const { search, sort } = req.query;
    const { records, stats } = await getSubmissions(search, sort);

    res.json({
      success: true,
      data: records,
      stats
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ success: false, message: 'Error retrieving submissions.' });
  }
});

// Delete a submission (Admin Only)
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

// Download details as CSV (Admin Only)
app.get('/api/admin/export', verifyAdminToken, async (req, res) => {
  try {
    const { records } = await getSubmissions('', 'newest');

    // Generate CSV Content
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
app.get('/scanner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🌸 Magic Petals App is running on http://localhost:${PORT}`);
  console.log(`📱 Customer Form: http://localhost:${PORT}/`);
  console.log(`📷 Front Scanner: http://localhost:${PORT}/scanner`);
  console.log(`🔐 Admin Panel: http://localhost:${PORT}/admin`);
});

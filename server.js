const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

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

// Database setup (creates database.db in project root)
const db = new Database(path.join(__dirname, 'database.db'));

// Initialize Database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('Database initialized successfully.');

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
    timestamp: new Date().toISOString()
  });
});

// Submit Customer Intake / Feedback Form
app.post('/api/submissions', (req, res) => {
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

    const stmt = db.prepare('INSERT INTO submissions (name, phone, feedback) VALUES (?, ?, ?)');
    const info = stmt.run(cleanName, cleanPhone, cleanFeedback);

    res.status(201).json({
      success: true,
      message: 'Thank you! Your details have been submitted to Magic Petals.',
      id: info.lastInsertRowid
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
app.get('/api/admin/submissions', verifyAdminToken, (req, res) => {
  try {
    const { search, sort } = req.query;
    let query = 'SELECT * FROM submissions';
    let params = [];

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query += ' WHERE name LIKE ? OR phone LIKE ? OR feedback LIKE ?';
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (sort === 'oldest') {
      query += ' ORDER BY created_at ASC';
    } else {
      query += ' ORDER BY created_at DESC';
    }

    const stmt = db.prepare(query);
    const records = stmt.all(...params);

    // Get analytics stats
    const totalStmt = db.prepare('SELECT COUNT(*) as total FROM submissions');
    const totalCount = totalStmt.get().total;

    const todayStmt = db.prepare("SELECT COUNT(*) as today FROM submissions WHERE date(created_at, 'localtime') = date('now', 'localtime')");
    const todayCount = todayStmt.get().today;

    res.json({
      success: true,
      data: records,
      stats: {
        total: totalCount,
        today: todayCount
      }
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ success: false, message: 'Error retrieving submissions.' });
  }
});

// Delete a submission (Admin Only)
app.delete('/api/admin/submissions/:id', verifyAdminToken, (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM submissions WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
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
app.get('/api/admin/export', verifyAdminToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, name, phone, feedback, created_at FROM submissions ORDER BY created_at DESC');
    const records = stmt.all();

    // Generate CSV Content
    let csv = 'ID,Name,Phone Number,Feedback / Message,Date & Time\n';

    records.forEach(row => {
      // Escape double quotes in CSV values
      const name = `"${(row.name || '').replace(/"/g, '""')}"`;
      const phone = `"${(row.phone || '').replace(/"/g, '""')}"`;
      const feedback = `"${(row.feedback || '').replace(/"/g, '""')}"`;
      const createdAt = `"${(row.created_at || '').replace(/"/g, '""')}"`;

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

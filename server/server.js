import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pool, { initDb } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

initDb().catch(console.error);

// ------------------- AUTH ROUTES -------------------

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, role',
      [username, password]
    );
    const user = result.rows[0];
    res.json({ userId: user.id, username: user.username, role: user.role });
  } catch (err) {
    res.status(400).json({ message: 'Username already taken or invalid input.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, username, role FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    res.json({ userId: user.id, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ------------------- HABIT / EVENT ROUTES -------------------

app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM events ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching habit options.' });
  }
});

// ------------------- ACTIVITY LOG ROUTES -------------------

app.post('/api/activities/save', async (req, res) => {
  const { userId, eventType, details, startTime, endTime } = req.body;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationSeconds = Math.max(0, Math.floor((end - start) / 1000));

  try {
    await pool.query(
      `INSERT INTO activities (user_id, event_type, details, start_time, end_time, duration_seconds) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, eventType, details || '', startTime, endTime, durationSeconds]
    );
    res.json({ success: true, message: 'Session logged successfully.' });
  } catch (err) {
    console.error('❌ Database insert error:', err);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/activities', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: 'Missing userId parameter' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM activities WHERE user_id = $1 ORDER BY start_time DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching activities:', err);
    res.status(500).json({ message: 'Error fetching activity logs' });
  }
});

// ------------------- ADMIN ROUTES -------------------

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users.' });
  }
});

app.post('/api/admin/events', async (req, res) => {
  const { eventName } = req.body;

  if (!eventName || !eventName.trim()) {
    return res.status(400).json({ message: 'Habit name is required.' });
  }

  try {
    const cleanName = eventName.trim();
    const existing = await pool.query('SELECT id FROM events WHERE name = $1', [cleanName]);
    if (existing.rows.length > 0) {
      return res.status(200).json({ message: 'Habit already exists!' });
    }

    const result = await pool.query(
      'INSERT INTO events (name, category) VALUES ($1, $2) RETURNING *',
      [cleanName, 'general']
    );

    res.status(201).json({ message: 'Habit added successfully!', event: result.rows[0] });
  } catch (err) {
    console.error('❌ Failed to inject habit:', err);
    res.status(500).json({ message: err.message });
  }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server listening at http://localhost:${PORT}`);
  });
}

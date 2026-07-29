import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pool, { initDb } from './db.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize DB tables automatically
initDb().catch(console.error);

// ------------------- AUTH ROUTES -------------------

// Register User
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

// Login User
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

// Get Habit List
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching habit options.' });
  }
});

// ------------------- ACTIVITY LOG ROUTES -------------------

// Save Activity Session
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
    console.error(err);
    res.status(500).json({ message: 'Error saving session.' });
  }
});

// Get User Activities
app.get('/api/activities', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM activities WHERE user_id = $1 ORDER BY start_time DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching activities.' });
  }
});

// ------------------- ADMIN ROUTES -------------------

// Get All Users
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users.' });
  }
});

// Add New Habit Option
app.post('/api/admin/events', async (req, res) => {
  const { eventName } = req.body;
  try {
    await pool.query('INSERT INTO events (name) VALUES ($1)', [eventName]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: 'Habit option already exists.' });
  }
});

// Export default app for Vercel Serverless
export default app;

// Listen locally when running 'node server.js'
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server listening at http://localhost:${PORT}`);
  });
}
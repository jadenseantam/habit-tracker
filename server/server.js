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

app.get('/api/daily-plans', async (req, res) => {
  const { userId, date } = req.query;

  if (!userId || !date) {
    return res.status(400).json({ message: 'Missing userId or date parameter.' });
  }

  try {
    const result = await pool.query(
      'SELECT habits, plan_date FROM daily_plans WHERE user_id = $1 AND plan_date = $2 LIMIT 1',
      [userId, date]
    );

    if (result.rows.length === 0) {
      return res.json({ habits: [], planDate: date });
    }

    const row = result.rows[0];
    res.json({ habits: row.habits || [], planDate: date });
  } catch (err) {
    console.error('❌ Error fetching daily plan:', err);
    res.status(500).json({ message: 'Error fetching daily plan.' });
  }
});

app.post('/api/daily-plans', async (req, res) => {
  const { userId, planDate, habits } = req.body;

  if (!userId || !planDate || !Array.isArray(habits)) {
    return res.status(400).json({ message: 'Missing userId, planDate, or habits array.' });
  }

  const cleanedHabits = habits
    .map(habit => String(habit).trim())
    .filter(Boolean);

  try {
    const result = await pool.query(
      `INSERT INTO daily_plans (user_id, plan_date, habits, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, plan_date)
       DO UPDATE SET habits = EXCLUDED.habits, updated_at = NOW()
       RETURNING habits, plan_date`,
      [userId, planDate, JSON.stringify(cleanedHabits)]
    );

    res.json({
      message: 'Daily habits saved successfully.',
      habits: result.rows[0].habits || [],
      planDate
    });
  } catch (err) {
    console.error('❌ Error saving daily plan:', err);
    res.status(500).json({ message: err.message });
  }
});

// ------------------- ACTIVITY LOG ROUTES -------------------

app.post('/api/activities/save', async (req, res) => {
  const { userId, eventType, details, startTime, endTime, sessionToken, planDate } = req.body;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationSeconds = Math.max(0, Math.floor((end - start) / 1000));

  if (!userId || !eventType || !startTime || !endTime || !planDate) {
    return res.status(400).json({ message: 'Missing required session data.' });
  }

  try {
    const planResult = await pool.query(
      'SELECT habits FROM daily_plans WHERE user_id = $1 AND plan_date = $2 LIMIT 1',
      [userId, planDate]
    );

    const planHabits = Array.isArray(planResult.rows[0]?.habits) ? planResult.rows[0].habits : [];
    const globalHabitResult = await pool.query(
      'SELECT 1 FROM events WHERE name = $1 LIMIT 1',
      [eventType]
    );

    const isInPlan = planHabits.includes(eventType);
    const isGlobalHabit = globalHabitResult.rows.length > 0;

    if (planHabits.length > 0 && !isInPlan && !isGlobalHabit) {
      return res.status(400).json({ message: 'Habit is not part of today\'s plan.' });
    }

    if (sessionToken) {
      const existing = await pool.query(
        'SELECT * FROM activities WHERE session_token = $1 LIMIT 1',
        [sessionToken]
      );

      if (existing.rows.length > 0) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'Session already logged.',
          activity: existing.rows[0]
        });
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO activities (user_id, event_type, details, start_time, end_time, duration_seconds, session_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, eventType, details || '', startTime, endTime, durationSeconds, sessionToken || null]
    );

    res.json({ success: true, duplicate: false, message: 'Session logged successfully.', activity: insertResult.rows[0] });
  } catch (err) {
    if (sessionToken && err.code === '23505') {
      const existing = await pool.query(
        'SELECT * FROM activities WHERE session_token = $1 LIMIT 1',
        [sessionToken]
      );

      if (existing.rows.length > 0) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'Session already logged.',
          activity: existing.rows[0]
        });
      }
    }

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

app.get('/api/admin/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, category FROM events ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching habits.' });
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

app.delete('/api/admin/events/:id', async (req, res) => {
  const eventId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(eventId)) {
    return res.status(400).json({ message: 'Invalid habit id.' });
  }

  try {
    const existing = await pool.query('SELECT id, name FROM events WHERE id = $1', [eventId]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found.' });
    }

    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    res.json({ message: 'Habit deleted successfully.' });
  } catch (err) {
    console.error('❌ Failed to delete habit:', err);
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

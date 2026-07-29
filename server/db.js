import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function initDb() {
  const client = await pool.connect();
  try {
    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user'
      );
    `);

    // 2. Events Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );
    `);

    // 3. Activities Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(255),
        details TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INT
      );
    `);

    // 4. Seed Default Admin Account
    await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ('jadentam', 'Jaden0309', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `);

    // 5. Seed Default Habit Options
    const checkEvents = await client.query('SELECT COUNT(*) FROM events');
    if (parseInt(checkEvents.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO events (name) VALUES ('Reading'), ('Homework'), ('Exercise')
        ON CONFLICT DO NOTHING;
      `);
    }

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  } finally {
    client.release();
  }
}

export default pool;

// DROP TABLE IF EXISTS activities, events, users CASCADE; 
// this line is to drop database from neon
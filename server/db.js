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
    // 1. Create tables ONLY if they don't exist yet
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );

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

    // 2. Add missing columns safely without touching existing data
    await client.query(`
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_type VARCHAR(255);
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS details TEXT;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS duration_seconds INT;
    `);

    // 3. Seed default values safely
    await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ('jadentam', 'Jaden0309', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `);

  const checkEvents = await client.query('SELECT COUNT(*) FROM events');
  if (parseInt(checkEvents.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO events (name) VALUES ('Homework')
      ON CONFLICT DO NOTHING;
    `);
  }

    console.log('✅ Database connected and verified safely!');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  } finally {
    client.release();
  }
}

export default pool;

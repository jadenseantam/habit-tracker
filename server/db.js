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
        name VARCHAR(255) UNIQUE NOT NULL,
        category VARCHAR(255) NOT NULL DEFAULT 'general'
      );

      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(255),
        details TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INT,
        session_token TEXT
      );

      CREATE TABLE IF NOT EXISTS daily_plans (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        plan_date DATE NOT NULL,
        habits JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, plan_date)
      );
    `);

    // 2. Add missing columns safely without touching existing data
    await client.query(`
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS event_type VARCHAR(255);
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS details TEXT;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS duration_seconds INT;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS session_token TEXT;
    `);

    await client.query(`
      ALTER TABLE daily_plans ADD COLUMN IF NOT EXISTS habits JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE daily_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE daily_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      CREATE UNIQUE INDEX IF NOT EXISTS daily_plans_user_date_unique_idx ON daily_plans (user_id, plan_date);
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS activities_session_token_unique_idx
      ON activities (session_token);
    `);

    // Ensure events.name is unique (older tables may lack this constraint)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS events_name_unique_idx ON events (name);
    `);

    await client.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(255) DEFAULT 'general';
      UPDATE events SET category = 'general' WHERE category IS NULL;
      ALTER TABLE events ALTER COLUMN category SET DEFAULT 'general';
      ALTER TABLE events ALTER COLUMN category SET NOT NULL;
    `);

    // 3. Seed default values safely
    await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ('jadentam', 'Jaden0309', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `);

  const checkEvents = await client.query('SELECT COUNT(*) FROM events');
  if (parseInt(checkEvents.rows[0].count) === 0) {
    await client.query(`INSERT INTO events (name, category) VALUES ('Homework', 'general')`);
  }

    console.log('✅ Database connected and verified safely!');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  } finally {
    client.release();
  }
}

export default pool;

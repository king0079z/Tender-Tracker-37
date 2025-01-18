import pg from 'pg';
import * as dotenv from 'dotenv';
const { Pool } = pg;

// Load environment variables
dotenv.config();

async function initializeDatabase() {
  console.log('Starting database initialization...');
  console.log('Database configuration:', {
    host: process.env.VITE_AZURE_DB_HOST,
    database: process.env.VITE_AZURE_DB_NAME,
    user: process.env.VITE_AZURE_DB_USER,
    hasPassword: !!process.env.VITE_AZURE_DB_PASSWORD
  });

  const pool = new Pool({
    host: process.env.VITE_AZURE_DB_HOST,
    database: process.env.VITE_AZURE_DB_NAME,
    user: process.env.VITE_AZURE_DB_USER,
    password: process.env.VITE_AZURE_DB_PASSWORD,
    port: 5432,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Test connection
    console.log('Testing database connection...');
    const client = await pool.connect();
    const testResult = await client.query('SELECT NOW()');
    console.log('Connection successful:', testResult.rows[0]);
    client.release();

    console.log('Creating tables...');
    
    await pool.query(`
      -- Create timelines table
      CREATE TABLE IF NOT EXISTS timelines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id text UNIQUE NOT NULL,
        company_name text NOT NULL,
        nda_received_date timestamptz,
        nda_received_completed boolean DEFAULT false,
        nda_signed_date timestamptz,
        nda_signed_completed boolean DEFAULT false,
        rfi_sent_date timestamptz,
        rfi_sent_completed boolean DEFAULT false,
        rfi_due_date timestamptz,
        rfi_due_completed boolean DEFAULT false,
        offer_received_date timestamptz,
        offer_received_completed boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      -- Create meetings table
      CREATE TABLE IF NOT EXISTS meetings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id text NOT NULL REFERENCES timelines(company_id) ON DELETE CASCADE,
        meeting_date timestamptz NOT NULL,
        subject text NOT NULL,
        notes text,
        created_at timestamptz DEFAULT now()
      );

      -- Create meeting attendees table
      CREATE TABLE IF NOT EXISTS meeting_attendees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        name text NOT NULL,
        email text,
        role text,
        created_at timestamptz DEFAULT now()
      );

      -- Create communications table
      CREATE TABLE IF NOT EXISTS communications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id text NOT NULL REFERENCES timelines(company_id) ON DELETE CASCADE,
        subject text NOT NULL,
        content text NOT NULL,
        sent_date timestamptz NOT NULL,
        created_by text NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      -- Create communication responses table
      CREATE TABLE IF NOT EXISTS communication_responses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        communication_id uuid NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
        response text NOT NULL,
        responder_name text NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);

    console.log('Tables created successfully');

    // Insert initial vendor data
    console.log('Inserting initial vendor data...');
    await pool.query(`
      INSERT INTO timelines (
        company_id,
        company_name,
        nda_received_completed,
        nda_signed_completed,
        rfi_sent_completed,
        rfi_due_completed,
        offer_received_completed
      ) VALUES
        ('1', 'Accenture', false, false, false, false, false),
        ('2', 'Atos', false, false, false, false, false),
        ('3', 'BCG', false, false, false, false, false),
        ('4', 'Cognizant', false, false, false, false, false),
        ('5', 'Dell', false, false, false, false, false),
        ('6', 'Delloitte', false, false, false, false, false),
        ('7', 'Digitas', false, false, false, false, false),
        ('8', 'Diversified', false, false, false, false, false),
        ('9', 'EY', false, false, false, false, false),
        ('10', 'GlobalLogic', false, false, false, false, false),
        ('11', 'GlobeCast', false, false, false, false, false),
        ('12', 'IBM', false, false, false, false, false),
        ('13', 'InfoSys', false, false, false, false, false),
        ('14', 'KPMG', false, false, false, false, false),
        ('15', 'Mckinsey', false, false, false, false, false),
        ('17', 'NEP', false, false, false, false, false),
        ('18', 'PWC', false, false, false, false, false),
        ('19', 'Qvest', false, false, false, false, false),
        ('20', 'SoftServe', false, false, false, false, false),
        ('21', 'SouthWorks', false, false, false, false, false),
        ('22', 'TenX', false, false, false, false, false),
        ('23', 'Valtech', false, false, false, false, false),
        ('24', 'Whyfive', false, false, false, false, false)
      ON CONFLICT (company_id) DO NOTHING;
    `);

    console.log('Initial data inserted successfully');
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Error initializing database:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    await pool.end();
  }
}

initializeDatabase().catch(console.error);
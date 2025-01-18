import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
import pkg from 'pg-connection-string';
const { parse } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function testDatabaseConnection() {
  console.log('Starting database connection tests...\n');

  // Parse connection string if available
  let config;
  const connectionString = process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;
  
  if (connectionString) {
    try {
      console.log('Using connection string configuration');
      const parsed = parse(connectionString);
      const serverName = parsed.host.split('.')[0];
      config = {
        ...parsed,
        user: `${parsed.user}@${serverName}`, // Format user for Azure
        password: process.env.AZURE_POSTGRESQL_PASSWORD || 
                 process.env.PGPASSWORD || 
                 process.env.WEBSITE_DBPASSWORD || 
                 parsed.password,
        ssl: { 
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.3'
        }
      };
    } catch (error) {
      console.error('Failed to parse connection string:', error);
    }
  }

  // Fallback to individual parameters
  if (!config) {
    console.log('Using individual parameter configuration');
    const serverName = 'tender-tracking-db2';
    config = {
      host: process.env.PGHOST || `${serverName}.postgres.database.azure.com`,
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || `abouelfetouhm@${serverName}`,
      password: process.env.PGPASSWORD || process.env.AZURE_POSTGRESQL_PASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { 
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      }
    };
  }

  // Add pool settings with shorter timeouts for testing
  config = {
    ...config,
    max: 1, // Single connection for testing
    connectionTimeoutMillis: 10000, // 10 seconds
    idleTimeoutMillis: 5000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 1000
  };

  // Environment check
  console.log('Environment Check:');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('- Connection string:', connectionString ? '✅' : '❌');
  console.log('- Password configured:', config.password ? '✅' : '❌');
  console.log('- Host:', config.host);
  console.log('- Database:', config.database);
  console.log('- User:', config.user);
  console.log('- Port:', config.port);
  console.log('- SSL enabled:', config.ssl ? '✅' : '❌');
  console.log('\n');

  // DNS lookup test
  console.log('Test 1: DNS Resolution');
  try {
    const dns = await import('dns');
    const { hostname } = new URL(`postgres://${config.host}`);
    const addresses = await dns.promises.resolve4(hostname);
    console.log('✅ DNS resolution successful');
    console.log('IP addresses:', addresses);
  } catch (error) {
    console.error('❌ DNS resolution failed:', error.message);
  }
  console.log('\n');

  // Test basic connection
  console.log('Test 2: Database Connection');
  const pool = new Pool(config);
  
  try {
    console.log('Attempting to connect...');
    const client = await pool.connect();
    console.log('✅ Connection successful');
    
    // Test query
    console.log('Testing query...');
    const result = await client.query('SELECT version()');
    console.log('✅ Query successful');
    console.log('Database version:', result.rows[0].version);
    
    client.release();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.message.includes('timeout')) {
      console.error('\nPossible causes:');
      console.error('1. Firewall rules not configured for your IP');
      console.error('2. Network connectivity issues');
      console.error('3. Database server is not accepting connections');
      console.error('\nSuggested actions:');
      console.error('1. Verify your IP is allowed in Azure PostgreSQL firewall rules');
      console.error('2. Check if the database server is running');
      console.error('3. Verify the connection string and credentials');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log('\nAll tests completed successfully.');
}

// Run test
testDatabaseConnection().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
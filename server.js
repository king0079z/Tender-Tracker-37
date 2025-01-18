import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';
import pg from 'pg';
import pkg from 'pg-connection-string';
const { parse } = pkg;
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Enable gzip compression
app.use(compression());
app.use(express.json());

// Enhanced database configuration with better error handling
const getDatabaseConfig = () => {
  // Try connection string first
  const connectionString = process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;
  if (connectionString) {
    try {
      console.log('Using connection string configuration');
      const config = parse(connectionString);
      return {
        ...config,
        password: process.env.WEBSITE_DBPASSWORD || 
                 process.env.PGPASSWORD || 
                 process.env.AZURE_POSTGRESQL_PASSWORD,
        ssl: { rejectUnauthorized: false },
        // Pool configuration
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000
      };
    } catch (error) {
      console.warn('Failed to parse connection string:', error.message);
    }
  }

  console.log('Using individual parameter configuration');
  // Fallback to individual parameters
  return {
    host: process.env.WEBSITE_PRIVATE_IP || 
          process.env.PGHOST || 
          'tender-tracking-db2.postgres.database.azure.com',
    database: process.env.WEBSITE_DBNAME || 
              process.env.PGDATABASE || 
              'tender_tracking_db',
    user: process.env.WEBSITE_DBUSER || 
          process.env.PGUSER || 
          'abouelfetouhm',
    password: process.env.WEBSITE_DBPASSWORD || 
              process.env.PGPASSWORD || 
              process.env.AZURE_POSTGRESQL_PASSWORD,
    port: parseInt(process.env.WEBSITE_DBPORT || 
           process.env.PGPORT || 
           '5432', 10),
    ssl: { rejectUnauthorized: false },
    // Pool configuration
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  };
};

let pool;
try {
  const dbConfig = getDatabaseConfig();
  console.log('Database configuration:', {
    host: dbConfig.host,
    database: dbConfig.database,
    user: dbConfig.user,
    port: dbConfig.port,
    ssl: !!dbConfig.ssl,
    hasPassword: !!dbConfig.password
  });
  pool = new Pool(dbConfig);
} catch (error) {
  console.error('Failed to initialize database pool:', error);
  process.exit(1);
}

// Connection management with enhanced logging
pool.on('connect', () => {
  console.log('New client connected to database');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);
  if (err.stack) {
    console.error('Error stack:', err.stack);
  }
});

// Enhanced health check endpoint with detailed error logging
app.get('/api/health', async (req, res) => {
  let client;
  try {
    console.log('Attempting database health check...');
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as time');
    console.log('Health check successful');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].time,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: PORT,
        dbHost: pool.options.host,
        dbName: pool.options.database
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (client) {
      client.release();
      console.log('Health check client released');
    }
  }
});

// Enhanced query endpoint with better error handling
app.post('/api/query', async (req, res) => {
  let client;
  try {
    const { text, params } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: true,
        message: 'Query text is required'
      });
    }

    console.log('Executing query:', text);
    console.log('Query parameters:', params);

    client = await pool.connect();
    const result = await client.query(text, params);
    console.log('Query executed successfully');
    
    res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields?.map(f => ({
        name: f.name,
        dataType: f.dataTypeID
      }))
    });
  } catch (error) {
    console.error('Query error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: true,
      message: error.message,
      code: error.code,
      detail: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    if (client) {
      client.release(true);
      console.log('Query client released');
    }
  }
});

// Serve static files
app.use(express.static(join(__dirname)));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Enhanced graceful shutdown
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  // Set a timeout for the graceful shutdown
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);

  try {
    if (pool) {
      console.log('Closing database pool...');
      await pool.end();
      console.log('Database pool closed');
    }
    
    clearTimeout(shutdownTimeout);
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server with enhanced connection validation
const startServer = async () => {
  try {
    console.log('Validating database connection...');
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection validated successfully');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Environment:', {
        nodeEnv: process.env.NODE_ENV,
        port: PORT,
        dbHost: pool.options.host,
        dbName: pool.options.database,
        dbUser: pool.options.user
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

startServer();
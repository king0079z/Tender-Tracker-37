import { parse } from 'pg-connection-string';

// Parse Azure PostgreSQL connection string
const getConnectionConfig = () => {
  const connectionString = process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;
  
  if (!connectionString) {
    // Fallback to individual parameters
    return {
      host: process.env.PGHOST || 'tender-tracking-db2.postgres.database.azure.com',
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'abouelfetouhm@tender-tracking-db2',
      password: process.env.AZURE_POSTGRESQL_PASSWORD || 
               process.env.PGPASSWORD || 
               process.env.WEBSITE_DBPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      }
    };
  }
  
  try {
    const parsedConfig = parse(connectionString);
    return {
      host: parsedConfig.host,
      database: parsedConfig.database || 'postgres',
      user: `${parsedConfig.user}@${parsedConfig.host.split('.')[0]}`, // Format user for Azure
      password: process.env.AZURE_POSTGRESQL_PASSWORD || 
               process.env.PGPASSWORD || 
               process.env.WEBSITE_DBPASSWORD || 
               parsedConfig.password,
      port: parseInt(parsedConfig.port || '5432', 10),
      ssl: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      }
    };
  } catch (error) {
    console.error('Failed to parse connection string:', error);
    return null;
  }
};

// Azure PostgreSQL configuration
export const dbConfig = {
  ...getConnectionConfig(),
  // Connection pool configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

// Validate configuration
export const validateConfig = () => {
  if (!dbConfig.password || typeof dbConfig.password !== 'string') {
    throw new Error(
      'Database password is not properly configured. Please set one of the following environment variables:\n' +
      '- AZURE_POSTGRESQL_PASSWORD\n' +
      '- PGPASSWORD\n' +
      '- WEBSITE_DBPASSWORD'
    );
  }
  
  if (!dbConfig.host || !dbConfig.database || !dbConfig.user) {
    throw new Error('Invalid database configuration. Missing required fields.');
  }
  
  return true;
};
import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  host: process.env.PAYMENT_DB_HOST || 'localhost',
  port: parseInt(process.env.PAYMENT_DB_PORT || '5434', 10),
  database: process.env.PAYMENT_DB_NAME || 'paymentdb',
  user: process.env.PAYMENT_DB_USER || 'postgres',
  password: process.env.PAYMENT_DB_PASSWORD || 'postgres',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
};

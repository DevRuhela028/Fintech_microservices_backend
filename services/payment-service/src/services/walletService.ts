import { PoolClient } from 'pg';
import { query } from '../db/connection';
import { AppError } from '../utils/AppError';

export const createWallet = async (userId: string, currency: string = 'INR') => {
  try {
    const res = await query(
      'INSERT INTO wallets (user_id, currency) VALUES ($1, $2) RETURNING *',
      [userId, currency]
    );
    return res.rows[0];
  } catch (error: any) {
    if (error.code === '23505') { // unique violation
      throw new AppError('Wallet already exists for this user', 409);
    }
    throw error;
  }
};

export const getWallet = async (userId: string) => {
  const res = await query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
  if (res.rowCount === 0) return null;
  return res.rows[0];
};

export const getWalletForUpdate = async (userId: string, client: PoolClient) => {
  const res = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  if (res.rowCount === 0) return null;
  return res.rows[0];
};

export const creditWallet = async (userId: string, amount: number, client: PoolClient) => {
  const res = await client.query(
    'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2 RETURNING *',
    [amount, userId]
  );
  return res.rows[0];
};

export const debitWallet = async (userId: string, amount: number, client: PoolClient) => {
  const res = await client.query(
    'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1 RETURNING *',
    [amount, userId]
  );
  if (res.rowCount === 0) {
    throw new AppError('Insufficient Funds', 422);
  }
  return res.rows[0];
};

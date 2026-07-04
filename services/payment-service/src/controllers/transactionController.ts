import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { pool, query } from '../db/connection';
import { AppError } from '../utils/AppError';
import { checkKey, storeKey } from '../services/idempotencyService';
import { getWalletForUpdate, debitWallet, creditWallet } from '../services/walletService';
import { producer } from '../utils/kafka';

const transactionSchema = z.object({
  senderId: z.string(),
  receiverId: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3),
});

export const createTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      return next(new AppError('Idempotency-Key header is required', 400));
    }

    const cachedResponse = await checkKey(idempotencyKey);
    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    const { senderId, receiverId, amount, currency } = transactionSchema.parse(req.body);

    if (senderId === receiverId) {
      return next(new AppError('Cannot transfer to yourself', 400));
    }

    const client = await pool.connect();
    let transactionRecord: any = null;
    let failureReason: string | null = null;
    let isFailed = false;
    let statusCode = 201;

    try {
      await client.query('BEGIN');

      const [first, second] = [senderId, receiverId].sort();
      await getWalletForUpdate(first, client);
      await getWalletForUpdate(second, client);

      await debitWallet(senderId, amount, client);
      await creditWallet(receiverId, amount, client);

      const insertRes = await client.query(
        'INSERT INTO transactions (idempotency_key, sender_id, receiver_id, amount, currency, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [idempotencyKey, senderId, receiverId, amount, currency, 'SUCCESS']
      );
      transactionRecord = insertRes.rows[0];

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      isFailed = true;
      failureReason = err.message || 'Unknown error';
      if (err instanceof AppError && err.statusCode === 422) {
        statusCode = 422;
      } else {
        statusCode = 500;
      }

      // Record the failed transaction
      try {
        const insertRes = await query(
          'INSERT INTO transactions (idempotency_key, sender_id, receiver_id, amount, currency, status, failure_reason) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [idempotencyKey, senderId, receiverId, amount, currency, 'FAILED', failureReason]
        );
        transactionRecord = insertRes.rows[0];
      } catch (insertErr) {
        console.error('Failed to record failed transaction:', insertErr);
      }
    } finally {
      client.release();
    }

    if (transactionRecord) {
      await producer.publish('payment.events', transactionRecord.id, {
        topic: 'payment.events',
        eventType: 'PAYMENT_CREATED',
        payload: {
          transactionId: transactionRecord.id,
          senderId: transactionRecord.sender_id,
          receiverId: transactionRecord.receiver_id,
          amount: transactionRecord.amount,
          currency: transactionRecord.currency,
          status: transactionRecord.status,
        },
        timestamp: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
      });
    }

    const responseBody = {
      transaction: transactionRecord,
      message: isFailed ? failureReason : 'Transaction successful'
    };

    if (statusCode === 201 || statusCode === 200) {
      await storeKey(idempotencyKey, responseBody);
    }
    
    // As per instruction, if it's 422 return 422
    res.status(statusCode).json(responseBody);
  } catch (error) {
    next(error);
  }
};

export const getTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM transactions WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      throw new AppError('Transaction not found', 404);
    }
    
    res.status(200).json({ transaction: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

export const refundTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM transactions WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      throw new AppError('Original transaction not found', 404);
    }
    
    const original = result.rows[0];
    if (original.status !== 'SUCCESS') {
      throw new AppError('Can only refund successful transactions', 400);
    }

    // A refund is a reverse transaction
    const idempotencyKey = `refund-${original.id}-${Date.now()}`;
    const amount = original.amount;
    const currency = original.currency;
    const senderId = original.receiver_id;
    const receiverId = original.sender_id;

    const client = await pool.connect();
    let transactionRecord: any = null;

    try {
      await client.query('BEGIN');

      const [first, second] = [senderId, receiverId].sort();
      await getWalletForUpdate(first, client);
      await getWalletForUpdate(second, client);

      await debitWallet(senderId, amount, client);
      await creditWallet(receiverId, amount, client);

      const metadata = JSON.stringify({ refundOf: original.id });
      const insertRes = await client.query(
        'INSERT INTO transactions (idempotency_key, sender_id, receiver_id, amount, currency, status, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [idempotencyKey, senderId, receiverId, amount, currency, 'SUCCESS', metadata]
      );
      transactionRecord = insertRes.rows[0];

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new AppError(`Refund failed: ${err.message}`, 422);
    } finally {
      client.release();
    }

    await producer.publish('payment.events', transactionRecord.id, {
      topic: 'payment.events',
      eventType: 'PAYMENT_REFUNDED',
      payload: {
        transactionId: transactionRecord.id,
        originalTransactionId: original.id,
        status: transactionRecord.status,
      },
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    });

    res.status(201).json({ transaction: transactionRecord });
  } catch (error) {
    next(error);
  }
};

export const updateTransactionStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = req.header('X-Internal-Secret');
    if (secret !== process.env.X_INTERNAL_SECRET) {
      throw new AppError('Forbidden: Invalid internal secret', 403);
    }

    const { id } = req.params;
    const { status } = req.body;

    const updateRes = await query(
      'UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (updateRes.rowCount === 0) {
      throw new AppError('Transaction not found', 404);
    }

    res.status(200).json({ transaction: updateRes.rows[0] });
  } catch (error) {
    next(error);
  }
};

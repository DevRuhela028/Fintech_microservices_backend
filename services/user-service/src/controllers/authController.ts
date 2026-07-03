import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../db/connection';
import { AppError } from '../utils/AppError';
import { producer } from '../utils/kafka';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const generateTokens = (id: string, email: string) => {
  const secret = process.env.JWT_SECRET || 'secret';
  const accessToken = jwt.sign({ id, email }, secret, { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' } as any);
  const refreshToken = jwt.sign({ id, email }, secret, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' } as any);
  return { accessToken, refreshToken };
};

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const checkEmail = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkEmail.rowCount && checkEmail.rowCount > 0) {
      throw new AppError('Email already in use', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insertRes = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, kyc_status',
      [email, passwordHash]
    );

    const user = insertRes.rows[0];
    const { accessToken, refreshToken } = generateTokens(user.id, user.email);
    const hashedRefresh = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashedRefresh, expiresAt]
    );

    await producer.publish('user.events', user.id, {
      topic: 'user.events',
      eventType: 'USER_REGISTERED',
      payload: { userId: user.id, email: user.email },
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, kycStatus: user.kyc_status },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (!userRes.rowCount || userRes.rowCount === 0) {
      throw new AppError('Invalid credentials', 401);
    }

    const user = userRes.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);
    const hashedRefresh = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashedRefresh, expiresAt]
    );

    res.status(200).json({
      user: { id: user.id, email: user.email, kycStatus: user.kyc_status },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const secret = process.env.JWT_SECRET || 'secret';

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, secret) as { id: string; email: string };
    } catch (err) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const hashedRefresh = hashToken(refreshToken);
    const tokenRes = await query(
      'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1',
      [hashedRefresh]
    );

    if (!tokenRes.rowCount || tokenRes.rowCount === 0) {
      throw new AppError('Invalid refresh token', 401);
    }

    const tokenRecord = tokenRes.rows[0];
    if (new Date() > new Date(tokenRecord.expires_at)) {
      await query('DELETE FROM refresh_tokens WHERE id = $1', [tokenRecord.id]);
      throw new AppError('Refresh token expired', 401);
    }

    await query('DELETE FROM refresh_tokens WHERE id = $1', [tokenRecord.id]);

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.id, decoded.email);
    const newHashedRefresh = hashToken(newRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [decoded.id, newHashedRefresh, expiresAt]
    );

    res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

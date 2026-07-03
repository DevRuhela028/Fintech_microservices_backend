import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/connection';
import { AppError } from '../utils/AppError';
import { KycStatus } from '../../../../shared/types';

const updateKycSchema = z.object({
  kycStatus: z.nativeEnum(KycStatus),
});

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const userRes = await query(
      'SELECT id, email, kyc_status, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    if (!userRes.rowCount || userRes.rowCount === 0) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({ user: userRes.rows[0] });
  } catch (error) {
    next(error);
  }
};

export const updateKyc = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { kycStatus } = updateKycSchema.parse(req.body);

    const updateRes = await query(
      'UPDATE users SET kyc_status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, kyc_status, created_at, updated_at',
      [kycStatus, id]
    );

    if (!updateRes.rowCount || updateRes.rowCount === 0) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({ user: updateRes.rows[0] });
  } catch (error) {
    next(error);
  }
};

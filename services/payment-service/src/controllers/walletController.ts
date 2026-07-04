import { Request, Response, NextFunction } from 'express';
import { createWallet, getWallet } from '../services/walletService';
import { AppError } from '../utils/AppError';

export const createWalletController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.body.userId || req.user?.id;
    if (!userId) {
      throw new AppError('User ID is required', 400);
    }
    const currency = req.body.currency || 'INR';
    
    const wallet = await createWallet(userId, currency);
    res.status(201).json({ wallet });
  } catch (error) {
    next(error);
  }
};

export const getWalletController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const wallet = await getWallet(userId);
    
    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }
    
    res.status(200).json({ wallet });
  } catch (error) {
    next(error);
  }
};

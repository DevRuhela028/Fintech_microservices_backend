import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { redisClient } from '../utils/redis';
import { AppError } from '../utils/AppError';

export const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.body.userId || req.params.userId || req.body.senderId || req.body.receiverId;
    if (!userId) {
      return next(new AppError('User ID is required', 400));
    }

    const cacheKey = `user_exists:${userId}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      if (cached === 'true') {
        return next();
      } else {
        return next(new AppError('User not found', 404));
      }
    }

    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:3000';
    try {
      // Need to pass the authorization header to user-service
      const headers = req.headers.authorization ? { Authorization: req.headers.authorization } : {};
      await axios.get(`${userServiceUrl}/users/${userId}`, { headers });
      
      await redisClient.set(cacheKey, 'true', 'EX', 300);
      return next();
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        await redisClient.set(cacheKey, 'false', 'EX', 300);
        return next(new AppError('User not found', 404));
      }
      return next(new AppError('Error verifying user', 500));
    }
  } catch (error) {
    next(error);
  }
};

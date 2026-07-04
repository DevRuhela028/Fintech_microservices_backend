import { redisClient } from '../utils/redis';

export const checkKey = async (key: string): Promise<any | null> => {
  const data = await redisClient.hgetall(`idempotency:${key}`);
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  try {
    return data.data ? JSON.parse(data.data) : null;
  } catch (e) {
    return null;
  }
};

export const storeKey = async (key: string, response: any, ttlSeconds: number = 86400): Promise<void> => {
  const redisKey = `idempotency:${key}`;
  await redisClient.hset(redisKey, {
    data: JSON.stringify(response),
  });
  await redisClient.expire(redisKey, ttlSeconds);
};

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { runMigrations } from './db/migrate';
import { redisClient } from './utils/redis';
import { producer } from './utils/kafka';
import { metricsMiddleware, register as prometheusRegistry } from './middleware/metrics';
import { errorHandler } from './middleware/errorHandler';
import walletRoutes from './routes/walletRoutes';
import transactionRoutes from './routes/transactionRoutes';

const app = express();
const PORT = process.env.PORT || 3001; // Note: We use 3001 as specified in the open questions response since nginx forwards to 3001

app.use(express.json());

// Basic CORS setup
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Internal-Secret');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(metricsMiddleware);

app.use('/wallets', walletRoutes);
app.use('/transactions', transactionRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'payment-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheusRegistry.contentType);
  res.end(await prometheusRegistry.metrics());
});

app.use(errorHandler);

const startServer = async () => {
  try {
    await runMigrations();
    
    // Redis is already connected upon instantiation, but we can verify
    await redisClient.ping();
    console.log('Redis ping successful');

    await producer.connect();

    const server = app.listen(PORT, () => {
      console.log(`Payment service is listening on port ${PORT}`);
    });

    const gracefulShutdown = async () => {
      console.log('Shutting down gracefully...');
      server.close();
      await producer.disconnect();
      await redisClient.quit();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

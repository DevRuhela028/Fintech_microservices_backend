import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { runMigrations } from './db/migrate';
import { producer } from './utils/kafka';
import { metricsMiddleware, register as prometheusRegistry } from './middleware/metrics';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import { createLogger } from '../../../shared/utils/logger';

const logger = createLogger();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Assuming basic cors configuration or we can just skip installing it since it wasn't in package.json
// Let's implement a simple permissive CORS middleware manually as it wasn't requested in package.json:
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(metricsMiddleware);

app.use('/auth', authRoutes);
app.use('/users', userRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'user-service' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheusRegistry.contentType);
  res.end(await prometheusRegistry.metrics());
});

app.use(errorHandler);

const startServer = async () => {
  try {
    await runMigrations();
    await producer.connect();

    const server = app.listen(PORT, () => {
      logger.info(`User service is listening on port ${PORT}`);
    });

    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close();
      await producer.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

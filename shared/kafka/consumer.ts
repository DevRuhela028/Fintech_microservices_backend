import { Kafka, Consumer, ConsumerConfig, EachMessagePayload } from 'kafkajs';

export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

export class KafkaConsumer {
  private consumer: Consumer;
  private isConnected = false;

  constructor(clientId: string, brokers: string[], groupId: string, config?: ConsumerConfig) {
    const kafka = new Kafka({
      clientId,
      brokers,
    });
    this.consumer = kafka.consumer({ groupId, ...config });
  }

  public async connect(): Promise<void> {
    await this.consumer.connect();
    this.isConnected = true;
    console.log('Successfully connected to Kafka consumer');
  }

  public async subscribe(topics: string[], handler: MessageHandler): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: true });
    }

    await this.consumer.run({
      eachMessage: async (payload) => {
        try {
          await handler(payload);
        } catch (error) {
          console.error(`Error processing message from topic ${payload.topic}:`, error);
          // Does NOT stop consuming on handler errors
        }
      },
    });

    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown() {
    const errorTypes = ['unhandledRejection', 'uncaughtException'];
    const signalTraps = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    errorTypes.forEach(type => {
      process.on(type, async (e) => {
        try {
          console.error(`process.on ${type}`);
          console.error(e);
          await this.disconnect();
          process.exit(0);
        } catch (_) {
          process.exit(1);
        }
      });
    });

    signalTraps.forEach(type => {
      process.once(type, async () => {
        try {
          await this.disconnect();
        } finally {
          process.kill(process.pid, type);
        }
      });
    });
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
      console.log('Disconnected from Kafka consumer');
    }
  }
}

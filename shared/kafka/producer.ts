import { Kafka, Producer, ProducerConfig } from 'kafkajs';
import { Counter } from 'prom-client';
import { KafkaEvent } from '../types';

export const kafkaEventsPublished = new Counter({
  name: 'kafka_events_published_total',
  help: 'Total number of Kafka events published',
  labelNames: ['topic', 'status'],
});

export class KafkaProducer {
  private producer: Producer;
  private isConnected = false;

  constructor(clientId: string, brokers: string[], config?: ProducerConfig) {
    const kafka = new Kafka({
      clientId,
      brokers,
    });
    this.producer = kafka.producer(config);
  }

  public async connect(retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.producer.connect();
        this.isConnected = true;
        console.log('Successfully connected to Kafka producer');
        return;
      } catch (error) {
        console.error(`Failed to connect to Kafka producer (attempt ${i + 1}/${retries}):`, error);
        if (i === retries - 1) throw error;
        const backoffTime = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  public async publish<T>(topic: string, key: string, event: KafkaEvent<T>): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Kafka producer is not connected');
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(event),
          },
        ],
      });
      kafkaEventsPublished.inc({ topic, status: 'success' });
    } catch (error) {
      kafkaEventsPublished.inc({ topic, status: 'error' });
      console.error(`Error publishing message to topic ${topic}:`, error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log('Disconnected from Kafka producer');
    }
  }
}

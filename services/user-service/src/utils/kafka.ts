import { KafkaProducer } from '../../../../shared/kafka/producer';

export const producer = new KafkaProducer('user-service', (process.env.KAFKA_BROKERS || 'localhost:29092').split(','));

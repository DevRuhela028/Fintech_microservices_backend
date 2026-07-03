export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  FLAGGED = 'FLAGGED',
}

export enum KycStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: KycStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  walletId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  type: 'CREDIT' | 'DEBIT';
  reference: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KafkaEvent<T> {
  topic: string;
  eventType: string;
  payload: T;
  timestamp: string;
  correlationId: string;
}

export interface NotificationPayload {
  userId: string;
  type: 'EMAIL' | 'SMS' | 'PUSH';
  templateId: string;
  data: Record<string, any>;
}

export interface FraudCheckPayload {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  ipAddress?: string;
  deviceId?: string;
}

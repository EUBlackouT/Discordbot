import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    logger.warn('DATABASE_URL should use PostgreSQL for production multi-tenant deployment.');
  }

  return new PrismaClient({
    log: process.env.LOG_LEVEL === 'debug' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export async function healthCheckDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

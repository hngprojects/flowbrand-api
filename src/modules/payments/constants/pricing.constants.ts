import { Logger } from '@nestjs/common';
import { env } from '../../../config/env';

const logger = new Logger('PricingConstants');

const FALLBACK = { ONETIME: 9999, MONTHLY: 2999, ANNUAL: 29999 };

function resolvePrice(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    logger.warn(`${label} not set — using placeholder ${fallback}`);
    return fallback;
  }
  // EC-03: zero price is a misconfiguration — never initiate a 0-amount payment
  if (value === 0) {
    logger.error(`${label} is zero — treating as misconfiguration, using placeholder ${fallback}`);
    return fallback;
  }
  return value;
}

export const PRICING = {
  PRO_ONETIME: resolvePrice(env.PRO_PLAN_PRICE_ONETIME, FALLBACK.ONETIME, 'PRO_PLAN_PRICE_ONETIME'),
  PRO_MONTHLY: resolvePrice(env.PRO_PLAN_PRICE_MONTHLY, FALLBACK.MONTHLY, 'PRO_PLAN_PRICE_MONTHLY'),
  PRO_ANNUAL: resolvePrice(env.PRO_PLAN_PRICE_ANNUAL, FALLBACK.ANNUAL, 'PRO_PLAN_PRICE_ANNUAL'),
} as const;

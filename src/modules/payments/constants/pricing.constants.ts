import { Logger } from '@nestjs/common';
import { env } from '../../../config/env';

const logger = new Logger('PricingConstants');

const FALLBACK_KOBO = { ONETIME: 900000, MONTHLY: 300000, ANNUAL: 3200000 };

function resolvePrice(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    logger.warn(`${label} not set — using placeholder ${fallback} kobo`);
    return fallback;
  }
  // EC-03: zero is a misconfiguration — never initiate a 0-amount payment
  if (value === 0) {
    logger.error(`${label} is zero — treating as misconfiguration, using placeholder ${fallback} kobo`);
    return fallback;
  }
  return value;
}

/** All values are in kobo (smallest NGN unit). 300000 = ₦3,000.00 */
export const PRICING = {
  PRO_ONETIME_KOBO: resolvePrice(env.PRO_PLAN_PRICE_ONETIME_KOBO, FALLBACK_KOBO.ONETIME, 'PRO_PLAN_PRICE_ONETIME_KOBO'),
  PRO_MONTHLY_KOBO: resolvePrice(env.PRO_PLAN_PRICE_MONTHLY_KOBO, FALLBACK_KOBO.MONTHLY, 'PRO_PLAN_PRICE_MONTHLY_KOBO'),
  PRO_ANNUAL_KOBO: resolvePrice(env.PRO_PLAN_PRICE_ANNUAL_KOBO, FALLBACK_KOBO.ANNUAL, 'PRO_PLAN_PRICE_ANNUAL_KOBO'),
} as const;

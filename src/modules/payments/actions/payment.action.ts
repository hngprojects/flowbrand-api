import { Injectable } from '@nestjs/common';

/**
 * Stub — real implementation ships with M4-BE-018 (PaymentService foundation).
 * This file exists solely so the NotificationListener can import and type-check
 * against PaymentModelAction before M4-BE-018 is merged.
 * When M4-BE-018 ships: delete this file and replace with the full entity-backed action.
 */
@Injectable()
export class PaymentModelAction {
  findByReference(reference: string): Promise<{
    amount: number | null;
    card_last4: string | null;
    card_brand: string | null;
    paid_at: Date | null;
  } | null> {
    void reference;
    return Promise.resolve(null);
  }
}

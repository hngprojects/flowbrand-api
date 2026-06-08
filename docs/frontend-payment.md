# Payment Module — Frontend Integration Guide

**Base URL:** `https://your-api-domain/api`  
**Auth:** All endpoints require `Authorization: Bearer <accessToken>` except `POST /payments/webhook` (public).

---

## Overview of payment types

There are two distinct payment flows:

| Flow | What it does | Subscription result |
| --- | --- | --- |
| **One-time** | Single charge of ₦9,000 | 1 month Pro access — does not auto-renew |
| **Subscription** | Recurring monthly (₦3,000) or annual (₦32,000) | Renews automatically until cancelled |

Both flows redirect the user to a Paystack-hosted checkout page. Your frontend never touches card data.

---

## Pricing

All amounts are in **kobo** (smallest NGN unit). Divide by 100 to display naira.

| Plan | Amount (kobo) | Amount (NGN) |
| --- | --- | --- |
| PRO one-time | `900000` | ₦9,000.00 |
| PRO monthly | `300000` | ₦3,000.00 |
| PRO annual | `3200000` | ₦32,000.00 |

---

## Flow 1 — One-time payment

### Step 1 — Initiate

```
POST /payments/initiate
Authorization: Bearer <accessToken>
```

No request body. The plan (`PRO`) and type (`one_time`) are hardcoded server-side.

**Success response `201`:**

```json
{
  "statusCode": 201,
  "message": "Payment initiated successfully",
  "data": {
    "reference": "550e8400-e29b-41d4-a716-446655440000",
    "authorizationUrl": "https://checkout.paystack.com/access_code_abc",
    "amount": 900000,
    "currency": "NGN"
  }
}
```

**Action:** Store `reference` locally, then redirect the user to `authorizationUrl`.

### Step 2 — User completes checkout

Paystack handles everything on their hosted page. After the user pays (or abandons), Paystack redirects back to your configured callback URL.

### Step 3 — Verify

Call this on your callback page with the `reference` you stored in Step 1.

```
GET /payments/verify?reference=550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <accessToken>
```

The `reference` must be a valid UUID v4 — the server validates the format before processing.

**Success response `200`:**

```json
{
  "statusCode": 200,
  "message": "Payment verified successfully",
  "data": {
    "status": "success",
    "reference": "550e8400-e29b-41d4-a716-446655440000",
    "plan": "pro",
    "amount": 900000,
    "currency": "NGN",
    "cardLast4": "4081",
    "cardBrand": "Visa"
  }
}
```

**Pending response (still processing):**

```json
{
  "statusCode": 200,
  "message": "Payment verified successfully",
  "data": {
    "status": "pending",
    "reference": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

If `status` is `pending`, poll again after 3–5 seconds. The server will not write SUCCESS until the gateway confirms.

**Failed response:**

```json
{
  "statusCode": 200,
  "message": "Payment verified successfully",
  "data": {
    "status": "failed",
    "reference": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**The `status` field drives your UI:**

| `status` | UI action |
| --- | --- |
| `success` | Show success screen. User now has Pro. |
| `pending` | Show loading state. Poll again in 3–5 seconds. |
| `failed` | Show failure screen. Offer retry. |

---

## Flow 2 — Subscription (recurring)

### Step 1 — Initiate

```
POST /payments/subscriptions/initiate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "billingCycle": "monthly"
}
```

`billingCycle` accepts `"monthly"` or `"annual"`.

**Success response `201`:**

```json
{
  "statusCode": 201,
  "message": "Subscription initiated successfully",
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/access_code_xyz",
    "amount": 300000,
    "currency": "NGN",
    "billingCycle": "monthly"
  }
}
```

Note: unlike the one-time flow, the subscription response does **not** include a `reference` in the initiate response. The `reference` becomes available after the user completes checkout — retrieve it

**Action:** Redirect the user to `authorizationUrl`.

### Step 2 — User completes checkout

Same as the one-time flow — Paystack handles the hosted checkout.

### Step 3 — Check subscription status

After the user returns from checkout, fetch their subscription:

```
GET /payments/subscription
Authorization: Bearer <accessToken>
```

**Success response `200`:**

```json
{
  "statusCode": 200,
  "message": "Subscription retrieved successfully",
  "data": {
    "subscriptionId": "uuid-here",
    "plan": "pro",
    "billingCycle": "monthly",
    "status": "active",
    "currentPeriodStart": "2026-06-04T10:00:00.000Z",
    "currentPeriodEnd": "2026-07-04T10:00:00.000Z",
    "cancelledAt": null,
    "downgradeAt": null
  }
}
```

If `status` is `pending`, the webhook hasn't fired yet — poll again in a few seconds. It moves to `active` once Paystack confirms the charge via webhook.

---

## Flow 3 — View subscription

```
GET /payments/subscription
Authorization: Bearer <accessToken>
```

**Response shape:**

| Field | Type | Notes |
| --- | --- | --- |
| `subscriptionId` | string (UUID) | Internal subscription ID |
| `plan` | `"pro"` | Always `pro` currently |
| `billingCycle` | `"monthly"` \| `"annual"` | One-time payment activates a `monthly` subscription |
| `status` | `"active"` \| `"pending"` \| `"cancelled"` \| `"expired"` | |
| `currentPeriodStart` | ISO 8601 string | When this billing period began |
| `currentPeriodEnd` | ISO 8601 string | When this billing period ends |
| `cancelledAt` | ISO 8601 string \| `null` | Set when user cancels |
| `downgradeAt` | ISO 8601 string \| `null` | Non-null when `cancel_at_period_end` is true — access ends on this date |

**404** if the user has no active subscription.

---

## Flow 4 — Cancel subscription

```
DELETE /payments/subscription
Authorization: Bearer <accessToken>
```

No request body.

**Success response `200`:**

```json
{
  "statusCode": 200,
  "message": "Subscription cancelled successfully",
  "data": {
    "cancelledAt": "2026-06-04T11:30:00.000Z",
    "accessUntil": "2026-07-04T10:00:00.000Z"
  }
}
```

`accessUntil` is when Pro access ends. The user keeps full access until then — cancellation is not immediate. Show this date in your UI: _"Your Pro access continues until July 4, 2026."_

After cancellation, `GET /payments/subscription` will show:
- `status: "cancelled"`
- `cancelledAt: <timestamp>`
- `downgradeAt: <same as accessUntil>`

---

## Error reference

| HTTP status | When it happens | What to show |
| --- | --- | --- |
| `400` | Invalid request body (e.g. bad `billingCycle` value) | Validation error in form |
| `401` | Missing or expired access token | Redirect to login |
| `402` | Payment provider declined the charge | "Payment failed — please try a different card" |
| `404` | No active subscription found | Hide subscription management UI |
| `409` | User already has Pro, or a payment is already in progress | "You already have an active plan" / "A payment is already in progress" |
| `422` | Amount mismatch detected (server-side security check) | "Payment could not be verified — contact support" |
| `429` | Rate limit exceeded (5 attempts per hour) | "Too many payment attempts. Please wait before trying again." |
| `502` | Paystack is unreachable | "Payment service temporarily unavailable. Please try again shortly." |

---

## Polling strategy for verify

After redirecting the user back from Paystack checkout, you don't know immediately whether the webhook has fired. Use this pattern:

```typescript
async function pollVerify(reference: string, maxAttempts = 10): Promise<PaymentVerifyResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`/api/payments/verify?reference=${reference}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();

    if (json.data.status === 'pending') {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3s
      continue;
    }

    return json.data; // success or failed — stop polling
  }

  throw new Error('Payment verification timed out');
}
```

Stop polling after ~10 attempts (30 seconds). If it is still `pending`, show a message: _"Payment is still processing — we'll update your account once it's confirmed."_

---

## Rate limits

| Endpoint | Limit |
| --- | --- |
| `POST /payments/initiate` | 5 requests per user per hour |
| `POST /payments/subscriptions/initiate` | 5 requests per user per hour |

The limits are enforced server-side via Redis. A 429 response means the user should wait before retrying.

---

## Things that happen automatically (no frontend action needed)

- **Webhook processing** — Paystack sends `charge.success`, `charge.failed`, `subscription.disable`, `subscription.not_renew` events directly to the backend. The backend processes these and updates su
- **Email notifications** — The notification system sends emails on plan upgrade, payment failure, and subscription cancellation. No frontend action required.
- **Subscription renewal** — Paystack charges the card automatically. The backend webhook handler marks the payment SUCCESS and refreshes the period dates. The subscription stays `active` with updated

---

## Complete sequence diagram

```text
ONE-TIME PAYMENT
────────────────
Frontend                   Backend                    Paystack
   │                          │                           │
   │  POST /payments/initiate │                           │
   │─────────────────────────▶│                           │
   │                          │ INSERT payment (PENDING)  │
   │                          │ call adapter.initiate()──▶│
   │                          │◀──────────── reference ───│
   │                          │ UPDATE payment w/ ref     │
   │◀──── { authorizationUrl }│                           │
   │                          │                           │
   │  redirect user ──────────────────────────────────────▶
   │                          │         user pays         │
   │◀──────── callback ────────────────────────────────────
   │                          │  charge.success webhook──▶│
   │                          │◀──────────────────────────│
   │                          │ UPDATE payment SUCCESS     │
   │                          │ CREATE/UPDATE subscription │
   │                          │   (1 month MONTHLY)        │
   │  GET /payments/verify    │                           │
   │─────────────────────────▶│                           │
   │◀── { status: "success" } │                           │


SUBSCRIPTION PAYMENT
────────────────────
Frontend                   Backend                    Paystack
   │                          │                           │
   │  POST /subscriptions/    │                           │
   │       initiate           │                           │
   │─────────────────────────▶│                           │
   │                          │ BEGIN TRANSACTION         │
   │                          │ INSERT subscription(PENDING)
   │                          │ INSERT payment (PENDING)  │
   │                          │ COMMIT                    │
   │                          │ call adapter.initiate()──▶│
   │                          │◀──── { authorizationUrl } │
   │◀── { authorizationUrl }  │                           │
   │                          │                           │
   │  redirect user ──────────────────────────────────────▶
   │                          │         user pays         │
   │◀──────── callback ────────────────────────────────────
   │                          │  charge.success webhook──▶│
   │                          │◀──────────────────────────│
   │                          │ UPDATE payment SUCCESS     │
   │                          │ UPDATE subscription ACTIVE │
   │  GET /payments/          │                           │
   │       subscription       │                           │
   │─────────────────────────▶│                           │
   │◀── { status: "active" }  │                           │
```

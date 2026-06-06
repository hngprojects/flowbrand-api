// Paystack webhook source IPs — secondary defence behind HMAC-SHA512 (SEC-06).
// Verify this list against https://paystack.com/docs/payments/webhooks/#ip-whitelisting
// before every deploy. A stale list silently blocks all legitimate webhooks.
export const PAYSTACK_WEBHOOK_IPS = new Set(['52.31.139.75', '52.49.173.169', '52.214.14.220']);

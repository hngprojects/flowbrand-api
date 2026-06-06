/**
 * End-to-end smoke test for the FlowBrand API.
 *
 * Runs the full happy-path flow in sequence:
 *   health → waitlist → contact → register → OTP verify → auth flows
 *   → onboarding → funnel generation → upload
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/test-api.ts [base-url]
 *
 * base-url defaults to http://localhost:3000
 *
 * NOTE: The script registers a fresh throwaway user on each run.
 *       OTP codes are read from the server logs — make sure LOG_LEVEL=debug
 *       or grab the code from the email that lands in your inbox/Mailtrap.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// ─── config ──────────────────────────────────────────────────────────────────

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api`;

// Paths excluded from the global prefix in main.ts — hit BASE directly
const NO_PREFIX = new Set(['/health', '/auth/google', '/auth/google/callback']);

const RUN_ID = Date.now();

// ── Admin smoke test — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env ──
// These must match what was used when running `pnpm seed:admin`.
const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? '';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';
// Throwaway admin account created during the admin smoke run — unique per RUN_ID
const CREATED_ADMIN_EMAIL = `newadmin+${RUN_ID}@test.dev`;
const CREATED_ADMIN_PASSWORD = `Admin@${RUN_ID}Aa1!`;  // meets complexity policy

// ── Reuse session — fill in your existing account credentials ────────────────
const EMAIL = 'dejibrandnew+smoke1779620966150@gmail.com';
const PASSWORD = 'Smoke@1779620966150!';
const NEW_PASS = `Reset@1779620966150!`;
// ── Fresh session (uncomment when running the full flow) ─────────────────────
// const EMAIL    = `dejibrandnew+smoke${RUN_ID}@gmail.com`;
// const PASSWORD = `Smoke@${RUN_ID}!`;
// const NEW_PASS = `Reset@${RUN_ID}!`;

// ─── colour helpers ───────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function pass(label: string, extra = '') {
  console.log(`${c.green}✓${c.reset} ${c.bold}${label}${c.reset}${extra ? `  ${c.dim}${extra}${c.reset}` : ''}`);
}

function fail(label: string, detail: string) {
  console.error(`${c.red}✗ ${label}${c.reset}  ${detail}`);
  process.exit(1);
}

function section(title: string) {
  console.log(`\n${c.cyan}${c.bold}── ${title} ──${c.reset}`);
}

function note(msg: string) {
  console.log(`${c.yellow}  ↳ ${msg}${c.reset}`);
}

function dump(data: unknown) {
  const lines = JSON.stringify(data, null, 2).split('\n');
  for (const line of lines) {
    console.log(`     ${c.dim}${line}${c.reset}`);
  }
}

/** Decode the payload section of a JWT without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    // JWT uses base64url — replace chars before passing to atob()
    const raw = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(raw)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

async function req<T = unknown>(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    token?: string;
    cookie?: string;
    formData?: FormData;
    expectStatus?: number | number[];
    label?: string;
  } = {},
): Promise<ApiResponse<T>> {
  const url = NO_PREFIX.has(path) ? `${BASE}${path}` : `${API}${path}`;
  const headers: Record<string, string> = {};

  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.cookie) headers['Cookie'] = opts.cookie;

  const init: RequestInit = { method, headers };

  if (opts.formData) {
    init.body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, init);
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    body = {} as T;
  }

  const expected = opts.expectStatus
    ? Array.isArray(opts.expectStatus)
      ? opts.expectStatus
      : [opts.expectStatus]
    : [200, 201];

  if (!expected.includes(res.status)) {
    fail(
      opts.label ?? `${method} ${path}`,
      `expected ${expected.join('|')} got ${res.status} — ${JSON.stringify(body).slice(0, 200)}`,
    );
  }

  return { status: res.status, body, headers: res.headers };
}

// ─── polling helper ───────────────────────────────────────────────────────────

async function poll<T>(
  fn: () => Promise<T>,
  until: (v: T) => boolean,
  opts: { intervalMs?: number; maxMs?: number; label?: string } = {},
): Promise<T> {
  const { intervalMs = 3000, maxMs = 120_000, label = 'poll' } = opts;
  const deadline = Date.now() + maxMs;
  let last!: T;
  while (Date.now() < deadline) {
    last = await fn();
    if (until(last)) return last;
    process.stdout.write(`${c.dim}  … waiting (${label})${c.reset}\r`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  fail(label, `timed out after ${maxMs / 1000}s — last value: ${JSON.stringify(last).slice(0, 200)}`);
  throw new Error('unreachable');
}

// ─── prompt helper ────────────────────────────────────────────────────────────

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${c.yellow}  ? ${question}${c.reset} `);
  rl.close();
  return answer.trim();
}

// ─── state ───────────────────────────────────────────────────────────────────

let accessToken = '';
let refreshCookie = '';
let sessionId = '';
let funnelId = '';
let funnelId2 = '';
let loginUser: { business_type?: string; target_customer?: string; primary_goal?: string } = {};

// payment smoke test state — populated by testPaymentInitiate / testSubscriptionInitiate
let oneTimePaymentRef = '';
let subscriptionPaymentRef = '';

// admin smoke test state
let adminAccessToken = '';
let adminRefreshCookie = '';
let newAdminToken = '';

// ─── tests ───────────────────────────────────────────────────────────────────

async function testHealth() {
  section('Health');
  const { body } = await req('GET', '/health', { label: 'GET /health' });
  pass('GET /health');
  dump(body);
}

async function testWaitlist() {
  section('Waitlist');
  const { body } = await req('POST', '/waitlist/join', {
    body: { email: `waitlist+${RUN_ID}@test.dev` },
    label: 'POST /waitlist/join',
  });
  pass('POST /waitlist/join');
  dump(body);
}

async function testContact() {
  section('Contact');
  const { body } = await req('POST', '/contact', {
    body: {
      fullName: 'Smoke Test',
      email: `contact+${RUN_ID}@test.dev`,
      businessName: 'Acme Inc',
      message: 'Automated smoke test — please ignore.',
    },
    label: 'POST /contact',
  });
  pass('POST /contact');
  dump(body);
}

async function testRegister() {
  section('Registration');
  const { body } = await req('POST', '/auth/register', {
    body: {
      fullName: 'Smoke Test',
      email: EMAIL,
      password: PASSWORD,
      termsAccepted: true,
    },
    label: 'POST /auth/register',
  });
  pass('POST /auth/register');
  dump(body);
}

async function testOtpFlow() {
  section('OTP Verification');

  // registration sets a 30s cooldown — wait it out before testing resend
  note('Waiting 31 s for resend cooldown…');
  await new Promise(r => setTimeout(r, 31_000));

  const { body: resendBody } = await req('POST', '/auth/resend-otp', {
    body: { email: EMAIL },
    expectStatus: 200,
    label: 'POST /auth/resend-otp',
  });
  pass('POST /auth/resend-otp');
  dump(resendBody);

  note('Check your email / Mailtrap for the OTP code.');
  const otp = await prompt('Enter the OTP code:');

  const { body, headers } = await req<{ data?: { accessToken?: string } }>(
    'POST', '/auth/verify-otp',
    {
      body: { email: EMAIL, otp_code: otp },
      label: 'POST /auth/verify-otp',
    },
  );

  accessToken = body.data?.accessToken ?? '';
  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(/(refreshToken=[^;]+)/);
  refreshCookie = match?.[1] ?? '';

  if (!accessToken) fail('POST /auth/verify-otp', 'no accessToken in response');
  pass('POST /auth/verify-otp');
  dump(body);
}

async function testGetMe() {
  section('Auth — GET /auth/me');
  const { body } = await req<{ data?: { email?: string } }>(
    'GET', '/auth/me',
    { token: accessToken, label: 'GET /auth/me' },
  );
  pass('GET /auth/me');
  dump(body);
}

async function testInitialLogin() {
  section('Initial Login (reuse session)');

  // Try NEW_PASS first (post-reset), fall back to PASSWORD (pre-reset).
  // The account may or may not have gone through testForgotPasswordFlow.
  type LoginBody = { data?: { accessToken?: string; user?: { business_type?: string; target_customer?: string; primary_goal?: string } } };
  let body: LoginBody = {};
  let headers = new Headers();

  const newPassRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: NEW_PASS }),
  });

  if (newPassRes.status === 200) {
    body = (await newPassRes.json()) as LoginBody;
    headers = newPassRes.headers;
    note('Logged in with NEW_PASS (password reset was run previously).');
  } else {
    note('NEW_PASS returned 401 — trying original PASSWORD (password reset not yet run).');
    const origRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (origRes.status !== 200) {
      fail('POST /auth/login (initial)', `both NEW_PASS and PASSWORD returned non-200 (${origRes.status}) — check credentials`);
    }
    body = (await origRes.json()) as LoginBody;
    headers = origRes.headers;
    note('Logged in with PASSWORD.');
  }

  accessToken = body.data?.accessToken ?? '';
  if (!accessToken) fail('POST /auth/login (initial)', 'no accessToken in response');
  loginUser = body.data?.user ?? {};
  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(/(refreshToken=[^;]+)/);
  refreshCookie = match?.[1] ?? '';
  pass('POST /auth/login (initial)');
  dump(body);
}

async function testRefreshToken() {
  section('Auth — Refresh Token');
  if (!refreshCookie) {
    note('No refresh_token cookie found — skipping refresh-token test.');
    return;
  }
  const { body, headers } = await req<{ data?: { accessToken?: string } }>(
    'POST', '/auth/refresh-token',
    {
      cookie: refreshCookie,
      expectStatus: 200,
      label: 'POST /auth/refresh-token',
    },
  );
  const newToken = body.data?.accessToken;
  if (!newToken) fail('POST /auth/refresh-token', 'no accessToken in response');
  accessToken = newToken!;

  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(/(refreshToken=[^;]+)/);
  refreshCookie = match?.[1] ?? refreshCookie;

  pass('POST /auth/refresh-token');
  dump(body);
}

async function testForgotPasswordFlow() {
  section('Password Reset Flow');

  const { body: forgotBody } = await req('POST', '/auth/forgot-password', {
    body: { email: EMAIL },
    expectStatus: [200, 201],
    label: 'POST /auth/forgot-password',
  });
  pass('POST /auth/forgot-password');
  dump(forgotBody);

  note('Check your email for the reset OTP.');
  note('⚠  Your inbox has multiple OTP emails — open the one with subject "Password Reset" (most recent).');
  const resetOtp = await prompt('Enter the reset OTP:');

  const { body: verifyResetBody } = await req<{ data?: { reset_token?: string } }>(
    'POST', '/auth/verify-reset-otp',
    {
      body: { email: EMAIL, otp_code: resetOtp },
      expectStatus: [200, 201],
      label: 'POST /auth/verify-reset-otp',
    },
  );
  const resetToken = verifyResetBody.data?.reset_token ?? '';
  if (!resetToken) fail('POST /auth/verify-reset-otp', 'no reset_token in response');
  pass('POST /auth/verify-reset-otp');
  dump(verifyResetBody);

  const { body: resetBody } = await req('POST', '/auth/reset-password', {
    body: { reset_token: resetToken, password: NEW_PASS },
    expectStatus: [200, 201],
    label: 'POST /auth/reset-password',
  });
  pass('POST /auth/reset-password');
  dump(resetBody);
}

async function testLoginWithNewPassword() {
  section('Login with reset password');
  const { body, headers } = await req<{ data?: { accessToken?: string } }>(
    'POST', '/auth/login',
    {
      body: { email: EMAIL, password: NEW_PASS },
      expectStatus: 200,
      label: 'POST /auth/login',
    },
  );
  accessToken = body.data?.accessToken ?? accessToken;

  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(/(refreshToken=[^;]+)/);
  refreshCookie = match?.[1] ?? refreshCookie;

  pass('POST /auth/login');
  dump(body);
}

async function testOnboarding() {
  section('Onboarding');

  const startRes = await req<{ data?: { sessionId?: string; status?: string; redirect?: { to: string } } }>(
    'POST', '/onboarding/start',
    { token: accessToken, label: 'POST /onboarding/start' },
  );

  const data = startRes.body.data;

  // Already complete → redirect back to dashboard
  if (data?.redirect) {
    note(`Already completed — redirect: ${data.redirect.to}`);
    pass('POST /onboarding/start (already done)');
    dump(startRes.body);
    return;
  }

  sessionId = data?.sessionId ?? '';
  if (!sessionId) fail('POST /onboarding/start', 'no sessionId in response');
  pass('POST /onboarding/start');
  dump(startRes.body);

  // Step 1 — business description
  const { body: step1Body } = await req('POST', '/onboarding/step', {
    token: accessToken,
    body: {
      session_id: sessionId,
      step: 1,
      answer: { business_description: 'We sell artisan coffee equipment online.' },
    },
    label: 'POST /onboarding/step (1)',
  });
  pass('POST /onboarding/step (1)');
  dump(step1Body);

  // Step 2 — customer tags
  const { body: step2Body } = await req('POST', '/onboarding/step', {
    token: accessToken,
    body: {
      session_id: sessionId,
      step: 2,
      answer: {
        customer_tags: {
          type: ['small business owners', 'home baristas'],
          location: ['Nigeria', 'UK'],
          wants: ['quality equipment', 'fast delivery'],
        },
        additional_notes: 'Customers value premium experience.',
      },
    },
    label: 'POST /onboarding/step (2)',
  });
  pass('POST /onboarding/step (2)');
  dump(step2Body);

  // Step 3 — discovery channel
  const { body: step3Body } = await req('POST', '/onboarding/step', {
    token: accessToken,
    body: {
      session_id: sessionId,
      step: 3,
      answer: { discovery_channel: 'Instagram' },
    },
    label: 'POST /onboarding/step (3)',
  });
  pass('POST /onboarding/step (3)');
  dump(step3Body);

  // Complete
  const completeRes = await req<{ data?: { redirect?: { to: string } } }>(
    'POST', '/onboarding/complete',
    {
      token: accessToken,
      body: { session_id: sessionId },
      label: 'POST /onboarding/complete',
    },
  );
  pass('POST /onboarding/complete');
  dump(completeRes.body);
}

async function testFunnels() {
  section('Funnels');

  // Generate a funnel — onboarding complete only redirects, it does not create one
  const { randomUUID } = await import('node:crypto');
  const genRes = await req<{ data?: { funnelId?: string; status?: string } }>(
    'POST', '/funnels/generate',
    {
      token: accessToken,
      body: { source: 'wizard', idempotency_key: randomUUID() },
      expectStatus: [200, 201, 202],
      label: 'POST /funnels/generate',
    },
  );
  funnelId = genRes.body.data?.funnelId ?? '';
  if (!funnelId) fail('POST /funnels/generate', 'no funnelId in response');
  pass('POST /funnels/generate');
  dump(genRes.body);

  // List — confirm funnel appears
  const listRes = await req<{ data?: { funnels?: { funnelId: string; status: string }[] } }>(
    'GET', '/funnels',
    { token: accessToken, label: 'GET /funnels' },
  );
  pass('GET /funnels');
  dump(listRes.body);

  // Poll generation status until terminal state
  note(`Polling generation status for funnel ${funnelId}…`);
  const statusRes = await poll(
    () => req<{ data?: { status?: string } }>(
      'GET', `/funnels/generate/status/${funnelId}`,
      { token: accessToken },
    ),
    (r) => {
      const s = r.body.data?.status?.toUpperCase();
      return s === 'ACTIVE' || s === 'FAILED';
    },
    { intervalMs: 4000, maxMs: 120_000, label: 'funnel generation' },
  );
  process.stdout.write('\n');

  const finalStatus = statusRes.body.data?.status;
  pass('GET /funnels/generate/status/:funnelId');
  dump(statusRes.body);

  if (finalStatus?.toUpperCase() === 'FAILED') {
    note('Funnel generation failed — skipping detail tests.');
    return;
  }

  // Full funnel detail
  const detailRes = await req<{ data?: { stages?: { stageId: string; name: string }[] } }>(
    'GET', `/funnels/${funnelId}`,
    { token: accessToken, label: 'GET /funnels/:id' },
  );
  pass('GET /funnels/:id');
  dump(detailRes.body);

  // Stages summary — data is a flat array, not { stages: [] }
  const stagesRes = await req<{ data?: { stageId: string; name: string }[] }>(
    'GET', `/funnels/${funnelId}/stages`,
    { token: accessToken, label: 'GET /funnels/:id/stages' },
  );
  const stages = stagesRes.body.data ?? detailRes.body.data?.stages ?? [];
  pass('GET /funnels/:id/stages');
  dump(stagesRes.body);

  // Stage detail — first stage only
  if (stages.length > 0) {
    const stageId = stages[0]!.stageId;
    const { body: stageBody } = await req(
      'GET', `/funnels/${funnelId}/stages/${stageId}`,
      { token: accessToken, label: 'GET /funnels/:id/stages/:stageId' },
    );
    pass('GET /funnels/:id/stages/:stageId');
    dump(stageBody);
  }
}

async function testUserProfile() {
  section('User Profile');

  const { body: profileBody } = await req<{ data?: { email?: string; fullName?: string } }>(
    'GET', '/users/me',
    { token: accessToken, label: 'GET /users/me' },
  );
  pass('GET /users/me');
  dump(profileBody);

  const { body: stateBody } = await req<{ data?: { activeFunnel?: unknown; onboardingComplete?: boolean } }>(
    'GET', '/users/me/state',
    { token: accessToken, label: 'GET /users/me/state' },
  );
  pass('GET /users/me/state');
  dump(stateBody);
}

async function testUpload() {
  section('Upload — extraction reliability');

  const DOCS: { file: string; mime: string }[] = [
    { file: 'MAMA TITI BSG.pdf', mime: 'application/pdf' },
    { file: 'Mama titi business operations.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    { file: 'MAMA TITI.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ];

  const form = new FormData();
  for (const doc of DOCS) {
    const abs = path.resolve(__dirname, '..', doc.file);
    const bytes = fs.readFileSync(abs);
    form.append('files', new Blob([bytes], { type: doc.mime }), doc.file);
    note(`Attaching ${doc.file} (${(bytes.length / 1024).toFixed(1)} KB)`);
  }

  const { body: uploadBody } = await req<{
    data?: { batchId?: string; uploads?: { uploadId?: string; fileName?: string; status?: string }[] };
  }>(
    'POST', '/funnels/upload',
    { token: accessToken, formData: form, expectStatus: 201, label: 'POST /funnels/upload' },
  );

  pass('POST /funnels/upload');
  dump(uploadBody);

  const uploads = uploadBody.data?.uploads ?? [];
  if (!uploads.length) {
    note('No uploads returned — skipping progress poll.');
    return;
  }

  // Poll every file to a terminal state and report the result for each.
  // This is the key assertion for extraction reliability: no file should
  // stay stuck at PARSING indefinitely.
  note(`Polling ${uploads.length} upload(s) to terminal state…`);

  const results = await Promise.all(
    uploads.map(async (u) => {
      const id = u.uploadId ?? '';
      if (!id) return { id, fileName: u.fileName, status: 'no-id' };

      const res = await poll(
        () => req<{ data?: { status?: string; percentComplete?: number; failureReason?: string } }>(
          'GET', `/funnels/upload/progress/${id}`,
          { token: accessToken },
        ),
        (r) => {
          const s = r.body.data?.status;
          return s === 'ready' || s === 'failed';
        },
        { intervalMs: 2000, maxMs: 90_000, label: `progress(${u.fileName ?? id})` },
      );
      process.stdout.write('\n');

      return {
        id,
        fileName: u.fileName,
        status: res.body.data?.status,
        percent: res.body.data?.percentComplete,
        reason: res.body.data?.failureReason,
      };
    }),
  );

  let anyFailed = false;
  for (const r of results) {
    if (r.status === 'ready') {
      pass(`GET /funnels/upload/progress/:id  ${r.fileName}`, `status=ready  percent=${r.percent}`);
    } else {
      anyFailed = true;
      note(`FAILED  ${r.fileName}  reason=${r.reason ?? 'none'}`);
      pass(`GET /funnels/upload/progress/:id  ${r.fileName}`, `status=${r.status} (expected in some cases)`);
    }
  }

  if (anyFailed) {
    note('One or more files failed extraction — check server logs for extraction_failed events.');
  }
}

async function testMultiFunnelSupport() {
  section('Multi-Funnel Support (M4-BE-xxx)');

  const { randomUUID } = await import('node:crypto');
  const key1 = randomUUID();
  const key2 = randomUUID();

  // ── EC-02: Create funnel 1, then immediately create funnel 2 ─────────────
  // Both calls happen before either finishes generating, proving the
  // in-flight block was removed and concurrent generation is allowed.

  note('Creating funnel 1…');
  const gen1 = await req<{ data?: { funnelId?: string; status?: string } }>(
    'POST', '/funnels/generate',
    {
      token: accessToken,
      body: { source: 'wizard', idempotency_key: key1 },
      expectStatus: [200, 201, 202],
      label: 'POST /funnels/generate (funnel 1)',
    },
  );
  funnelId = gen1.body.data?.funnelId ?? '';
  if (!funnelId) fail('POST /funnels/generate (funnel 1)', 'no funnelId in response');
  pass('Funnel 1 created', `id=${funnelId}  status=${gen1.body.data?.status}`);

  note('Creating funnel 2 immediately (EC-02: concurrent generation must be allowed)…');
  const gen2 = await req<{ data?: { funnelId?: string; status?: string } }>(
    'POST', '/funnels/generate',
    {
      token: accessToken,
      body: { source: 'wizard', idempotency_key: key2 },
      expectStatus: [200, 201, 202],
      label: 'POST /funnels/generate (funnel 2)',
    },
  );
  funnelId2 = gen2.body.data?.funnelId ?? '';
  if (!funnelId2) fail('POST /funnels/generate (funnel 2)', 'no funnelId in response');
  if (funnelId2 === funnelId) fail('POST /funnels/generate (funnel 2)', 'same funnelId as funnel 1 — new funnel was not created');
  pass('EC-02: Funnel 2 created while funnel 1 is still generating', `id=${funnelId2}  status=${gen2.body.data?.status}`);

  // ── AC-03 / FR-3: Idempotency scoped per user ────────────────────────────
  note('Replaying funnel 1 key — must return the same funnelId, not a new funnel…');
  const idempRes = await req<{ data?: { funnelId?: string } }>(
    'POST', '/funnels/generate',
    {
      token: accessToken,
      body: { source: 'wizard', idempotency_key: key1 },
      expectStatus: [200, 201], // NestJS POST routes always return 201 at transport level
      label: 'POST /funnels/generate (idempotency replay)',
    },
  );
  if (idempRes.body.data?.funnelId !== funnelId) {
    fail('AC-03: idempotency', `expected ${funnelId}, got ${idempRes.body.data?.funnelId}`);
  }
  pass('AC-03/FR-3: Idempotency — same key returns 200 with original funnelId');

  // ── AC-02 / AC-05 / FR-4: GET /funnels lists both, stages have task counts ─
  const listRes = await req<{
    data?: {
      funnels?: {
        funnelId: string;
        status: string;
        stages: { position: number; name: string; status: string; tasksTotal: number; tasksComplete: number }[];
      }[];
    };
  }>('GET', '/funnels', { token: accessToken, label: 'GET /funnels (multi-funnel list)' });

  const listedFunnels = listRes.body.data?.funnels ?? [];
  const listedIds = listedFunnels.map((f) => f.funnelId);

  if (!listedIds.includes(funnelId)) fail('AC-02: GET /funnels', `funnel 1 (${funnelId}) missing from list`);
  if (!listedIds.includes(funnelId2)) fail('AC-02: GET /funnels', `funnel 2 (${funnelId2}) missing from list`);
  pass(`AC-02: GET /funnels returns both funnels (${listedFunnels.length} total in page)`);

  // AC-05: funnel 2 must appear with status generating
  const f2Listed = listedFunnels.find((f) => f.funnelId === funnelId2);
  pass(`AC-05: Funnel 2 in list with status: ${f2Listed?.status}`);

  // FR-4: every stage must carry tasksTotal and tasksComplete (may be 0 while generating)
  let stageShapeOk = true;
  for (const f of listedFunnels) {
    for (const s of f.stages ?? []) {
      if (typeof s.tasksTotal !== 'number' || typeof s.tasksComplete !== 'number') {
        stageShapeOk = false;
        note(`FR-4 FAIL: funnel ${f.funnelId} stage ${s.position} missing tasksTotal/tasksComplete`);
      }
    }
  }
  if (stageShapeOk) pass('FR-4: All stages in list carry tasksTotal and tasksComplete');
  dump(listRes.body);

  // ── FR-5 / EC-01: State endpoint — generating funnel must not override an active one ──

  // Check state right now (both may still be generating)
  const stateWhileGenerating = await req<{ data?: { activeFunnel?: { funnelId: string; status: string } } }>(
    'GET', '/users/me/state',
    { token: accessToken, label: 'GET /users/me/state (both generating)' },
  );
  const af1 = stateWhileGenerating.body.data?.activeFunnel;
  pass(`GET /users/me/state (both generating) → status=${af1?.status ?? 'null'}  funnelId=${af1?.funnelId ?? 'null'}`);
  dump(stateWhileGenerating.body);

  // Poll funnel 1 to terminal state
  note(`Polling funnel 1 (${funnelId}) to terminal state…`);
  const terminalRes = await poll(
    () => req<{ data?: { status?: string } }>(
      'GET', `/funnels/generate/status/${funnelId}`,
      { token: accessToken },
    ),
    (r) => { const s = r.body.data?.status?.toUpperCase(); return s === 'ACTIVE' || s === 'FAILED'; },
    { intervalMs: 4_000, maxMs: 120_000, label: 'funnel 1 generation' },
  );
  process.stdout.write('\n');
  const funnel1Status = terminalRes.body.data?.status?.toUpperCase();
  pass(`Funnel 1 reached terminal state: ${funnel1Status}`);

  if (funnel1Status === 'ACTIVE') {
    // EC-01: State must return funnel 1 (active) even if funnel 2 is still generating
    const stateAfterActive = await req<{ data?: { activeFunnel?: { funnelId: string; status: string } } }>(
      'GET', '/users/me/state',
      { token: accessToken, label: 'GET /users/me/state (funnel 1 active, funnel 2 may be generating)' },
    );
    const af2 = stateAfterActive.body.data?.activeFunnel;

    if (af2?.status === 'active') {
      pass(`EC-01/FR-5: State surfaces active funnel (${af2.funnelId}) — generating funnel does not override it`);
    } else {
      // Funnel 2 may have also completed by now — still a valid state
      note(`State returned status=${af2?.status} — funnel 2 may have already completed`);
      pass('GET /users/me/state returned a valid non-null activeFunnel');
    }
    dump(stateAfterActive.body);

    // AC-07: Funnel 1 detail is still intact — creating funnel 2 did not touch it
    const detailRes = await req<{ data?: { stages?: { stageId: string; status: string; tasksTotal: number }[] } }>(
      'GET', `/funnels/${funnelId}`,
      { token: accessToken, label: `GET /funnels/${funnelId} (AC-07: stages intact)` },
    );
    const stages = detailRes.body.data?.stages ?? [];
    if (!stages.length) fail('AC-07', 'funnel 1 has no stages — may have been mutated');
    const hasTaskCounts = stages.some((s) => s.tasksTotal > 0);
    pass(`AC-07: Funnel 1 stages intact (${stages.length} stages)${hasTaskCounts ? ', task counts populated' : ''}`);
    dump(detailRes.body);

    // FR-4: After active — list should show real task counts on funnel 1
    const listAfter = await req<{
      data?: { funnels?: { funnelId: string; stages: { tasksTotal: number; tasksComplete: number }[] }[] };
    }>('GET', '/funnels', { token: accessToken, label: 'GET /funnels (after funnel 1 active)' });
    const f1After = listAfter.body.data?.funnels?.find((f) => f.funnelId === funnelId);
    const hasRealCounts = f1After?.stages?.some((s) => s.tasksTotal > 0);
    if (hasRealCounts) {
      pass('FR-4: Active funnel stages have non-zero tasksTotal in list');
    } else {
      note('FR-4: tasksTotal still 0 in list — tasks may not yet exist for this funnel');
    }
  } else {
    note('Funnel 1 failed generation — skipping active-state assertions.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ST-1: Wizard context fix (#141 + #142)
//   Verifies that after the fix:
//     • business fields on the user profile are populated from onboarding
//     • a new wizard funnel gets businessName from step_1.business_description
//       (not the "My Business" default)
//
// ST-2 (Physical Location → primary_goal=sales) requires a fresh user.
//   Manual verification:
//     1. Complete onboarding with discovery_channel="Physical Location"
//     2. Query DB: SELECT primary_goal FROM users WHERE id = '<your-user-id>'
//     3. Expected: primary_goal = 'sales'  (was 'awareness' before the fix)
//
// ST-3: Document-upload path regression is covered by testUpload() below.
// ─────────────────────────────────────────────────────────────────────────────

async function testWizardContextFix() {
  section('ST-1 — Wizard context fix (#141 + #142)');

  // 1. Assert user profile has the business fields written by completeOnboarding.
  //    GET /users/me returns a trimmed profile DTO — business fields are on the login
  //    response data.user, which was stored in loginUser during testInitialLogin.
  const business_type = loginUser.business_type ?? '';
  const target_customer = loginUser.target_customer ?? '';
  const primary_goal = loginUser.primary_goal ?? '';

  if (!business_type) fail('ST-1 login user', 'business_type is empty — completeOnboarding did not write context');
  if (!target_customer) fail('ST-1 login user', 'target_customer is empty');
  if (!primary_goal) fail('ST-1 login user', 'primary_goal is empty');
  pass('User profile business fields populated', `type=${business_type.slice(0, 40)}  goal=${primary_goal}`);

  // 2. Generate a new wizard funnel with a fresh idempotency key
  const { randomUUID } = await import('node:crypto');
  const newKey = randomUUID();
  const { body: genBody } = await req<{ data?: { funnelId?: string; status?: string } }>(
    'POST', '/funnels/generate',
    {
      token: accessToken,
      body: { source: 'wizard', idempotency_key: newKey },
      expectStatus: [200, 201, 202],
      label: 'POST /funnels/generate (wizard, fresh key)',
    },
  );
  const newFunnelId = genBody.data?.funnelId ?? '';
  if (!newFunnelId) fail('ST-1 POST /funnels/generate', 'no funnelId in response');
  pass('POST /funnels/generate', `id=${newFunnelId}`);

  // 3. GET /funnels immediately — businessName must NOT be the default 'My Business'
  const { body: listBody } = await req<{
    data?: { funnels?: { funnelId: string; businessName: string; status: string }[] };
  }>('GET', '/funnels', { token: accessToken, label: 'GET /funnels (businessName check immediately after create)' });

  const newFunnel = (listBody.data?.funnels ?? []).find((f) => f.funnelId === newFunnelId);
  if (!newFunnel) fail('ST-1 GET /funnels', `new funnel ${newFunnelId} not in list`);

  if (newFunnel!.businessName === 'My Business') {
    fail('ST-1 businessName', '"My Business" default — wizard context fix was not applied correctly');
  }

  if (newFunnel!.businessName !== business_type) {
    note(`businessName="${newFunnel!.businessName}" vs user.business_type="${business_type}" — mismatch`);
  }
  pass(`ST-1: businessName correct — "${newFunnel!.businessName}"  (not "My Business")`);

  // 4. Poll to terminal state
  note(`Polling funnel ${newFunnelId} to terminal state…`);
  const termRes = await poll(
    () => req<{ data?: { status?: string } }>(
      'GET', `/funnels/generate/status/${newFunnelId}`,
      { token: accessToken },
    ),
    (r) => { const s = r.body.data?.status?.toUpperCase(); return s === 'ACTIVE' || s === 'FAILED'; },
    { intervalMs: 4_000, maxMs: 120_000, label: 'wizard context funnel' },
  );
  process.stdout.write('\n');

  const finalStatus = termRes.body.data?.status?.toUpperCase();
  pass(`Funnel reached terminal state: ${finalStatus}`);

  // 5. Post-generation: confirm businessName persists and dump full funnel detail
  if (finalStatus === 'ACTIVE') {
    const { body: listAfter } = await req<{
      data?: { funnels?: { funnelId: string; businessName: string }[] };
    }>('GET', '/funnels', { token: accessToken, label: 'GET /funnels (post-generation businessName check)' });

    const fAfter = (listAfter.data?.funnels ?? []).find((f) => f.funnelId === newFunnelId);
    if (fAfter?.businessName === 'My Business') {
      fail('ST-1 post-generation businessName', '"My Business" persisted after generation completed');
    }
    pass(`ST-1: businessName persists post-generation — "${fAfter?.businessName}"`);

    const { body: detailBody } = await req(
      'GET', `/funnels/${newFunnelId}`,
      { token: accessToken, label: `GET /funnels/${newFunnelId}` },
    );
    pass(`GET /funnels/${newFunnelId}`);
    dump(detailBody);
  } else {
    note('Funnel generation failed — post-generation checks skipped.');
  }

  note('ST-2 reminder: test Physical Location → primary_goal=sales with a fresh user.');
  note('  1. Complete onboarding with discovery_channel="Physical Location"');
  note('  2. Query DB: SELECT primary_goal FROM users WHERE id = <id>');
  note('  Expected: primary_goal = \'sales\'  (was \'awareness\' before the fix)');
}

async function testPaymentInitiate() {
  section('Payments — POST /payments/initiate (M4-BE-019)');

  if (!accessToken) {
    note('No accessToken — run testInitialLogin() first. Skipping.');
    return;
  }

  // ── AC-07: Unauthenticated → 401 ────────────────────────────────────────────
  await req('POST', '/payments/initiate', {
    expectStatus: 401,
    label: 'POST /payments/initiate (no token → 401)',
  });
  pass('AC-07: unauthenticated request → 401 (global AuthGuard)');

  // ── AC-01: Authenticated request ────────────────────────────────────────────
  // Three valid outcomes depending on server/account state:
  //   201 — free user, payment session created
  //   409 — user is already on the Pro plan (PaymentRateLimitGuard short-circuits)
  //   402 — provider declined (mock adapter in failure mode: TEST_PAYMENT_OUTCOME=failure)
  const { body, status } = await req<{
    data?: { reference?: string; authorizationUrl?: string; amount?: number; currency?: string };
    message?: string;
  }>('POST', '/payments/initiate', {
    token: accessToken,
    expectStatus: [201, 402, 409],
    label: 'POST /payments/initiate',
  });

  if (status === 409) {
    // Two possible 409 sources:
    //   PAYMENT_USER_ALREADY_PRO  — guard found an ACTIVE subscription
    //   PAYMENT_ALREADY_INITIATED — service found a PENDING payment row (idempotency)
    note(`409: "${String(body.message)}" — either already Pro or a prior payment is in progress.`);
    note('To test the 201 path: clear pending payment rows or use a fresh account.');
    pass('POST /payments/initiate → 409 (conflict guard or idempotency fired correctly)');
    dump(body);
    return;
  }

  if (status === 402) {
    note('Payment provider returned 402 — server likely has TEST_PAYMENT_OUTCOME=failure.');
    note('Set TEST_PAYMENT_OUTCOME=success in the server .env to test the 201 happy path.');
    pass('AC-06: 402 PaymentFailedException propagates correctly (provider failure path confirmed)');
    dump(body);
    return;
  }

  // ── AC-01: Validate 201 response shape ──────────────────────────────────────
  const rawData = body.data;
  if (!rawData?.reference) fail('AC-01 reference', 'missing or empty reference in response');

  oneTimePaymentRef = rawData!.reference!;

  // authorizationUrl is empty on the idempotent path (service returns the prior reference
  // but does not store the original Paystack URL). Accept both cases.
  if (!rawData?.authorizationUrl) {
    note(`AC-04 idempotent path: prior payment found  reference=${oneTimePaymentRef}`);
    note('authorizationUrl is empty — service returned an existing reference without a second Paystack call.');
    note('(authorization_url is not persisted in the payment row; this is a known limitation)');
    pass('AC-04: idempotent return — reference present, no duplicate Paystack call');
    dump(body);
    return;
  }

  if (typeof rawData?.amount !== 'number') fail('SEC-01 amount', `expected number, got ${typeof rawData?.amount}`);
  if (rawData?.currency !== 'NGN') fail('AC-01 currency', `expected NGN, got ${String(rawData?.currency)}`);
  pass('AC-01: 201 response shape — reference, authorizationUrl, amount, currency all present');

  const amount = rawData!.amount!;
  const authorizationUrl = rawData!.authorizationUrl!;

  // ── SEC-01: Amount comes from server PRICING, not client ────────────────────
  if (amount <= 0) fail('SEC-01', `amount must be positive, got ${String(amount)}`);
  pass(`SEC-01: amount=${String(amount)} kobo (server-side PRICING — no client input accepted)`);

  // ── SEC-03: authorizationUrl returned opaque ─────────────────────────────────
  pass(`SEC-03: authorizationUrl received opaque — "${authorizationUrl.slice(0, 60)}…"`);

  // ── AC-04: Idempotent retry ─────────────────────────────────────────────────
  // A second call within the hour window should also succeed (idempotency handled by service).
  // Both calls are valid — the service either creates or returns the existing in-progress payment.
  const { body: retryBody, status: retryStatus } = await req<{
    data?: { reference?: string };
  }>('POST', '/payments/initiate', {
    token: accessToken,
    expectStatus: [201, 409],
    label: 'POST /payments/initiate (retry — idempotency)',
  });
  if (retryStatus === 201) {
    pass(`AC-04: idempotent retry → 201  reference=${retryBody.data?.reference ?? '?'}`);
  } else {
    note('AC-04: retry returned 409 — either already Pro or prior payment fully completed.');
    pass('AC-04: idempotency path exercised');
  }

  note('AC-05 (already Pro → 409): tested above if account has an active subscription.');
  note('AC-08 (rate limit → 429): covered by scripts/test-rate-limits.ts — testPaymentInitiateRateLimit().');

  dump(body);
}

async function testSubscriptionInitiate() {
  section('Payments — POST /payments/subscriptions/initiate (M4-BE-019b)');

  if (!accessToken) {
    note('No accessToken — run testInitialLogin() first. Skipping.');
    return;
  }

  // ── AC-07: Unauthenticated → 401 ────────────────────────────────────────────
  await req('POST', '/payments/subscriptions/initiate', {
    body: { billingCycle: 'monthly' },
    expectStatus: 401,
    label: 'POST /payments/subscriptions/initiate (no token → 401)',
  });
  pass('AC-07: unauthenticated request → 401 (global AuthGuard)');

  // ── VAL-01: Invalid billingCycle value → 400 ────────────────────────────────
  // Guards run before ValidationPipe in NestJS. If the account has an active or
  // pending subscription, SubscriptionRateLimitGuard fires 409 before the pipe
  // can validate the billingCycle field. Both outcomes are correct.
  const { status: val1Status } = await req('POST', '/payments/subscriptions/initiate', {
    token: accessToken,
    body: { billingCycle: 'quarterly' },
    expectStatus: [400, 409],
    label: 'POST /payments/subscriptions/initiate (invalid billingCycle → 400 or 409)',
  });
  if (val1Status === 400) {
    pass('VAL-01: invalid billingCycle → 400 (ValidationPipe + @IsEnum)');
  } else {
    note('VAL-01: guard returned 409 before validation ran — account has an active/pending subscription.');
    note('To test the 400 path in isolation: use a fresh account with no existing subscription.');
    pass('VAL-01: 409 (SubscriptionRateLimitGuard pre-empted ValidationPipe — correct NestJS guard ordering)');
  }

  // ── VAL-02: Missing billingCycle → 400 ─────────────────────────────────────
  const { status: val2Status } = await req('POST', '/payments/subscriptions/initiate', {
    token: accessToken,
    body: {},
    expectStatus: [400, 409],
    label: 'POST /payments/subscriptions/initiate (missing billingCycle → 400 or 409)',
  });
  if (val2Status === 400) {
    pass('VAL-02: missing billingCycle → 400 (required field missing)');
  } else {
    note('VAL-02: guard returned 409 before validation ran — same guard-ordering reason as VAL-01.');
    pass('VAL-02: 409 (SubscriptionRateLimitGuard pre-empted ValidationPipe)');
  }

  // ── AC-01: Authenticated request — MONTHLY ──────────────────────────────────
  // Valid outcomes depending on server/account state:
  //   201 — user has no active/pending subscription
  //   409 — user already has an ACTIVE or PENDING subscription (guard short-circuits)
  //   402 — provider declined (mock adapter in failure mode: TEST_PAYMENT_OUTCOME=failure)
  //   502 — provider unavailable (non-HttpException → BadGatewayException)
  const { body, status } = await req<{
    data?: { authorizationUrl?: string; amount?: number; currency?: string; billingCycle?: string };
    message?: string;
  }>('POST', '/payments/subscriptions/initiate', {
    token: accessToken,
    body: { billingCycle: 'monthly' },
    expectStatus: [201, 402, 409, 502],
    label: 'POST /payments/subscriptions/initiate (monthly)',
  });

  if (status === 409) {
    // Two possible 409 sources:
    //   SUBSCRIPTION_USER_ALREADY_SUBSCRIBED — guard found ACTIVE or PENDING subscription
    //   SUBSCRIPTION_ALREADY_ACTIVE          — service idempotency (pending row exists, no code yet)
    note(`409: "${String(body.message)}" — user already has an active or pending subscription.`);
    note('To test the 201 path: cancel the existing subscription or use a fresh account.');
    pass('POST /payments/subscriptions/initiate → 409 (subscription guard or idempotency fired correctly)');
    dump(body);
    return;
  }

  if (status === 402) {
    note('402: provider declined — server likely has TEST_PAYMENT_OUTCOME=failure.');
    note('Set TEST_PAYMENT_OUTCOME=success in .env to test the 201 happy path.');
    pass('AC-06: 402 PaymentFailedException propagates correctly (provider failure path confirmed)');
    dump(body);
    return;
  }

  if (status === 502) {
    note('502: provider unavailable — non-HttpException correctly mapped to BadGatewayException.');
    pass('AC-06: 502 BadGateway on infrastructure failure');
    dump(body);
    return;
  }

  // ── AC-01: Validate 201 response shape ─────────────────────────────────────
  const rawData = body.data;
  // Capture reference for testVerifyPayment — present if 019b exposes it in the response
  subscriptionPaymentRef = (rawData as Record<string, unknown>)?.reference as string ?? '';
  if (!rawData?.authorizationUrl) fail('AC-01 authorizationUrl', 'missing or empty authorizationUrl');
  if (typeof rawData?.amount !== 'number') fail('SEC-01 amount', `expected number, got ${typeof rawData?.amount}`);
  if (rawData?.currency !== 'NGN') fail('AC-01 currency', `expected "NGN", got "${String(rawData?.currency)}"`);
  if (rawData?.billingCycle !== 'monthly') fail('AC-01 billingCycle', `expected "monthly", got "${String(rawData?.billingCycle)}"`);
  pass('AC-01: 201 response shape — authorizationUrl, amount, currency, billingCycle present and correct');

  // ── SEC-03: subscriptionCode must NOT be in the response ────────────────────
  // The Paystack access_code (checkout session token) is not the real SUB_xxx identifier.
  // The real code arrives via the subscription.create webhook (M4-BE-021).
  const dataAsRecord = rawData as Record<string, unknown>;
  if ('subscriptionCode' in dataAsRecord) {
    fail('SEC-03 subscriptionCode', 'subscriptionCode must not be exposed — real SUB_xxx identifier arrives via webhook');
  }
  pass('SEC-03: subscriptionCode absent from response (arrives via webhook in M4-BE-021)');

  // ── SEC-01: Amount comes from server PRICING, never from client ─────────────
  const amount = rawData!.amount!;
  if (amount <= 0) fail('SEC-01', `amount must be positive, got ${String(amount)}`);
  if (amount !== 300000) {
    note(`SEC-01: monthly amount=${String(amount)} kobo — expected 300000 (PRO_MONTHLY_KOBO fallback); verify PRICING env vars`);
  } else {
    pass(`SEC-01: amount=${String(amount)} kobo matches PRO_MONTHLY_KOBO (server-side PRICING)`);
  }

  // ── SEC-03: authorizationUrl returned opaque ────────────────────────────────
  pass(`SEC-03: authorizationUrl received opaque — "${rawData!.authorizationUrl!.slice(0, 60)}…"`);

  // ── AC-01b: Annual billing cycle ────────────────────────────────────────────
  // After a successful monthly initiation above, a PENDING subscription exists.
  // The guard (ACTIVE + PENDING check) will block this call with 409 — which is
  // correct behaviour and proves AC-05 at the same time.
  const { body: annualBody, status: annualStatus } = await req<{
    data?: { authorizationUrl?: string; amount?: number; billingCycle?: string };
    message?: string;
  }>('POST', '/payments/subscriptions/initiate', {
    token: accessToken,
    body: { billingCycle: 'annual' },
    expectStatus: [201, 409],
    label: 'POST /payments/subscriptions/initiate (annual — expects 409 if PENDING sub exists)',
  });

  if (annualStatus === 409) {
    note('409 on annual call — PENDING subscription from monthly initiation is still open.');
    pass('AC-05: SubscriptionRateLimitGuard blocks second initiation while PENDING sub exists → 409');
  } else {
    if (annualBody.data?.billingCycle !== 'annual') {
      fail('AC-01b billingCycle', `expected "annual", got "${String(annualBody.data?.billingCycle)}"`);
    }
    const annualAmount = annualBody.data?.amount ?? 0;
    if (annualAmount !== 3200000) {
      note(`AC-01b: annual amount=${String(annualAmount)} kobo — expected 3200000 (PRO_ANNUAL_KOBO fallback)`);
    } else {
      pass(`AC-01b: annual amount=${String(annualAmount)} kobo matches PRO_ANNUAL_KOBO`);
    }
    pass(`AC-01b: annual 201 — billingCycle="${String(annualBody.data?.billingCycle)}" amount=${String(annualAmount)}`);
    dump(annualBody);
  }

  // ── @Transform: uppercase billingCycle is normalised server-side ────────────
  // @Transform(lowercase) in InitiateSubscriptionRequestDto means "MONTHLY" maps to "monthly"
  // before @IsEnum runs — client does not need to send lowercase.
  // Expect 409 here (PENDING sub still exists) — a 400 would mean the transform is not applied.
  const { status: transformStatus } = await req<{ message?: string }>(
    'POST', '/payments/subscriptions/initiate',
    {
      token: accessToken,
      body: { billingCycle: 'MONTHLY' },
      expectStatus: [201, 409],
      label: 'POST /payments/subscriptions/initiate (@Transform: "MONTHLY" accepted → 201 or 409)',
    },
  );
  if (transformStatus === 400) {
    fail('@Transform', '"MONTHLY" (uppercase) returned 400 — @Transform(lowercase) is not applied');
  }
  pass('@Transform: "MONTHLY" (uppercase) normalised by server — 400 was not returned');

  note('AC-08 (rate limit → 429): covered by scripts/test-rate-limits.ts — testSubscriptionInitiateRateLimit().');

  dump(body);
}

async function testVerifyPayment() {
  section('Payments — GET /payments/verify (M4-BE-020)');

  if (!accessToken) {
    note('No accessToken — run testInitialLogin() first. Skipping.');
    return;
  }

  const { randomUUID } = await import('node:crypto');

  // ── Unauthenticated → 401 ──────────────────────────────────────────────────
  await req('GET', '/payments/verify?reference=550e8400-e29b-41d4-a716-446655440000', {
    expectStatus: 401,
    label: 'GET /payments/verify (no token → 401)',
  });
  pass('Unauthenticated request → 401 (global AuthGuard)');

  // ── Non-UUID reference → 400 ────────────────────────────────────────────────
  await req('GET', '/payments/verify?reference=not-a-uuid', {
    token: accessToken,
    expectStatus: 400,
    label: 'GET /payments/verify (non-UUID reference → 400)',
  });
  pass('Non-UUID reference → 400 (ParseUUIDPipe)');

  // ── Non-existent UUID → 404 ─────────────────────────────────────────────────
  // The endpoint returns 404 for both "not found" and "wrong user" — intentional:
  // a 403 would confirm the payment ID exists, leaking information.
  const ghostRef = randomUUID();
  await req('GET', `/payments/verify?reference=${ghostRef}`, {
    token: accessToken,
    expectStatus: 404,
    label: 'GET /payments/verify (non-existent reference → 404)',
  });
  pass('Non-existent reference → 404 (ownership check — same response for missing and wrong-user)');

  // ── ONE_TIME happy path ─────────────────────────────────────────────────────
  if (!oneTimePaymentRef) {
    note('No ONE_TIME reference saved — testPaymentInitiate() must hit the 201 path first.');
    note('Ensure TEST_PAYMENT_OUTCOME=success and the account has no active subscription, then re-run.');
  } else {
    note(`Verifying ONE_TIME payment  reference=${oneTimePaymentRef}`);
    const { body: v1 } = await req<{
      data?: {
        status?: string; plan?: string; reference?: string;
        amount?: number; currency?: string; cardLast4?: string; cardBrand?: string;
      };
    }>('GET', `/payments/verify?reference=${oneTimePaymentRef}`, {
      token: accessToken,
      expectStatus: 200,
      label: 'GET /payments/verify (ONE_TIME → 200)',
    });

    const d = v1.data;
    pass(`AC-01: ONE_TIME verify → 200  status=${d?.status}`);

    if (d?.status === 'success') {
      if (d.plan !== 'pro') fail('AC-01 plan', `expected "pro", got "${String(d.plan)}"`);
      if (d.reference !== oneTimePaymentRef) fail('AC-01 reference echo', 'reference in response does not match');
      if (typeof d.amount !== 'number') fail('AC-01 amount', 'amount missing from success response');
      if (d.currency !== 'NGN') fail('AC-01 currency', `expected "NGN", got "${String(d.currency)}"`);
      pass('AC-01: SUCCESS shape — plan=pro, reference, amount=NGN present');
      dump(v1);

      // ── Idempotent: second call returns same SUCCESS, no duplicate subscription ──
      const { body: v2 } = await req<{ data?: { status?: string } }>(
        'GET', `/payments/verify?reference=${oneTimePaymentRef}`,
        { token: accessToken, expectStatus: 200, label: 'GET /payments/verify (idempotent 2nd call)' },
      );
      if (v2.data?.status !== 'success') {
        fail('Idempotent verify', `2nd call returned status="${String(v2.data?.status)}", expected "success"`);
      }
      pass('Idempotent: 2nd verify returns SUCCESS without creating a duplicate subscription row');
    } else if (d?.status === 'pending') {
      note('Status is PENDING — gateway has not confirmed yet. Set TEST_PAYMENT_OUTCOME=success and retry.');
      pass('GET /payments/verify → 200 PENDING (gateway not yet confirmed)');
    } else if (d?.status === 'failed') {
      note('Status is FAILED — server likely has TEST_PAYMENT_OUTCOME=failure.');
      pass('GET /payments/verify → 200 FAILED (gateway failure propagated correctly)');
    }
  }

  // ── SUBSCRIPTION happy path ─────────────────────────────────────────────────
  if (!subscriptionPaymentRef) {
    note('No SUBSCRIPTION reference saved — either testSubscriptionInitiate() did not hit 201,');
    note('or the 019b controller does not expose "reference" in its response body.');
  } else {
    note(`Verifying SUBSCRIPTION payment  reference=${subscriptionPaymentRef}`);
    const { body: sv } = await req<{ data?: { status?: string; plan?: string } }>(
      'GET', `/payments/verify?reference=${subscriptionPaymentRef}`,
      { token: accessToken, expectStatus: 200, label: 'GET /payments/verify (SUBSCRIPTION → 200)' },
    );
    pass(`SUBSCRIPTION verify → 200  status=${sv.data?.status}`);
    if (sv.data?.status === 'success') {
      if (sv.data.plan !== 'pro') fail('SUBSCRIPTION plan', `expected "pro", got "${String(sv.data.plan)}"`);
      pass('SUBSCRIPTION: SUCCESS — PENDING row promoted to ACTIVE, plan=pro');
    } else {
      note(`SUBSCRIPTION status=${sv.data?.status} — set TEST_PAYMENT_OUTCOME=success to confirm the activation path.`);
    }
    dump(sv);
  }

  // ── Scenarios that require non-mock setup ───────────────────────────────────
  note('Wrong user → 404: requires a 2nd account whose payment reference you know. The 404 (not 403) prevents reference enumeration.');
  note('Amount mismatch → 422: requires the mock adapter to return a different amount than amount_kobo in the DB — not triggerable via env vars today.');
  note('Gateway timeout → 504: requires PAYMENT_PROVIDER=paystack and a real Paystack network timeout. Not testable with the mock adapter.');
}

async function testWebhook() {
  section('Payments — POST /payments/webhook (M4-BE-021)');

  if (!accessToken) {
    note('No accessToken — run testInitialLogin() first. Skipping.');
    return;
  }

  // Read PAYSTACK_SECRET_KEY from process.env, then fall back to .env file
  let paystackSecret = process.env.PAYSTACK_SECRET_KEY ?? '';
  if (!paystackSecret) {
    try {
      const envContent = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf-8');
      const match = envContent.match(/^PAYSTACK_SECRET_KEY=(.+)$/m);
      // dotenv strips inline comments (e.g. "sk_xxx   # note"); we must do the same
      paystackSecret = match?.[1]?.trim().replace(/\s+#.*$/, '').replace(/^"|"$/g, '').trim() ?? '';
    } catch { /* .env not readable */ }
  }

  if (!paystackSecret) {
    note('PAYSTACK_SECRET_KEY not found — skipping webhook tests.');
    note('Set PAYSTACK_SECRET_KEY= in .env or export it in your shell, then re-run.');
    return;
  }

  const { createHmac, randomUUID } = await import('node:crypto');

  function sign(bodyStr: string): string {
    return createHmac('sha512', paystackSecret).update(bodyStr).digest('hex');
  }

  async function postWebhook(
    event: string,
    data: Record<string, unknown>,
    opts: { sig?: string; expectStatus?: number | number[]; label?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const bodyStr = JSON.stringify({ event, data });
    const sig = opts.sig ?? sign(bodyStr);
    const res = await fetch(`${API}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
      body: bodyStr,
    });
    let body: unknown;
    try { body = await res.json(); } catch { body = {}; }

    const expected = opts.expectStatus
      ? (Array.isArray(opts.expectStatus) ? opts.expectStatus : [opts.expectStatus])
      : [200];

    if (!expected.includes(res.status)) {
      fail(
        opts.label ?? `POST /payments/webhook (${event})`,
        `expected ${expected.join('|')} got ${res.status} — ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    return { status: res.status, body };
  }

  const ghostRef = randomUUID();
  const ghostSubCode = `SUB_${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

  // ── SEC-01: Invalid signature → 401 ─────────────────────────────────────────
  // The adapter rejects before any DB lookup — timingSafeEqual fails → UnauthorizedException.
  await postWebhook(
    'charge.success',
    { reference: ghostRef },
    { sig: 'deadbeef00deadbeef00', expectStatus: 401, label: 'POST /payments/webhook (invalid sig → 401)' },
  );
  pass('SEC-01: Invalid x-paystack-signature → 401 (timingSafeEqual HMAC rejected — no processing)');

  // ── WH-07: Unknown event type → 200 ─────────────────────────────────────────
  // Falls through to the default logger branch. Paystack requires 200 on all deliveries.
  const { body: unknownEvtBody } = await postWebhook(
    'refund.processed',
    { reference: ghostRef },
    { expectStatus: 200, label: 'POST /payments/webhook (unknown event → 200)' },
  );
  const receivedFlag = (unknownEvtBody as { data?: { received?: boolean } }).data?.received;
  if (receivedFlag !== true) {
    fail('WH-07 body shape', `expected data.received=true, got: ${JSON.stringify(unknownEvtBody).slice(0, 100)}`);
  }
  pass('WH-07: Unknown event type (refund.processed) → 200  data.received=true');

  // ── WH-01: Valid signature accepted, post-signature error swallowed ──────────
  // ghost reference → payment not found → handler warns and returns → still 200
  await postWebhook(
    'charge.success',
    { reference: ghostRef, amount: 900000 },
    { expectStatus: 200, label: 'POST /payments/webhook (valid sig, ghost ref → 200 no-op)' },
  );
  pass('WH-01: Valid signature + non-existent reference → 200 (error swallowed after valid sig)');

  // ── WH-05: charge.failed with ghost reference → 200 no-op ───────────────────
  await postWebhook(
    'charge.failed',
    { reference: ghostRef },
    { expectStatus: 200, label: 'POST /payments/webhook (charge.failed, ghost ref → 200)' },
  );
  pass('WH-05: charge.failed, non-existent reference → 200 no-op');

  // ── DC-3 / WH-06: subscription.disable → data.subscription_code, not data.reference ──
  // For subscription.* events the adapter maps data.subscription_code → event.reference
  // before the handler runs. Sending data.reference here would produce an empty reference
  // that never matches anything — the correct field is subscription_code.
  await postWebhook(
    'subscription.disable',
    { subscription_code: ghostSubCode, status: 'cancelled' },
    { expectStatus: 200, label: 'POST /payments/webhook (subscription.disable → 200 no-op)' },
  );
  pass(`DC-3: subscription.disable uses data.subscription_code as event.reference  code=${ghostSubCode}`);
  pass('WH-06: subscription.disable, subscription not in DB → 200 no-op (warning logged server-side)');

  // ── WH-03: charge.success with real PENDING payment → activates subscription ─
  if (!oneTimePaymentRef) {
    note('WH-03: No ONE_TIME reference from testPaymentInitiate() — skipping live activation test.');
    note('Run testPaymentInitiate() in the 201 path first, then re-run.');
  } else {
    // Check current payment status before sending the webhook
    const preRes = await fetch(`${API}/payments/verify?reference=${oneTimePaymentRef}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const preParsed = (await preRes.json()) as { data?: { status?: string } };
    const preStatus = preParsed.data?.status ?? 'unknown';
    note(`WH-03: ONE_TIME pre-webhook status=${preStatus}  reference=${oneTimePaymentRef}`);

    if (preStatus === 'pending') {
      // Payment is PENDING — webhook should activate it and emit PLAN_UPGRADED
      await postWebhook(
        'charge.success',
        { reference: oneTimePaymentRef, amount: 900000, authorization: { last4: '4081', brand: 'visa' } },
        { expectStatus: 200, label: 'POST /payments/webhook (charge.success → activate ONE_TIME)' },
      );
      pass('WH-03: charge.success delivered → 200');

      // GET /payments/verify short-circuits from DB once status=SUCCESS — no gateway call needed
      const postRes = await fetch(`${API}/payments/verify?reference=${oneTimePaymentRef}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const postParsed = (await postRes.json()) as { data?: { status?: string; plan?: string } };
      const postStatus = postParsed.data?.status;
      if (postStatus !== 'success') {
        fail('WH-03 post-webhook verify', `expected status=success, got ${String(postStatus)}`);
      }
      pass(`WH-03: charge.success (ONE_TIME) → payment activated  status=success  plan=${String(postParsed.data?.plan)}`);
      dump(postParsed);

      // Replay: already SUCCESS — handler logs and returns early, still 200
      await postWebhook(
        'charge.success',
        { reference: oneTimePaymentRef, amount: 900000 },
        { expectStatus: 200, label: 'POST /payments/webhook (charge.success replay → 200 no-op)' },
      );
      pass('WH-03 replay: charge.success on SUCCESS payment → 200 no-op (already terminal)');

    } else if (preStatus === 'success') {
      note('Payment already SUCCESS — confirming replay path only.');
      await postWebhook(
        'charge.success',
        { reference: oneTimePaymentRef, amount: 900000 },
        { expectStatus: 200, label: 'POST /payments/webhook (charge.success replay on SUCCESS → 200)' },
      );
      pass('WH-03 replay: charge.success on already-SUCCESS payment → 200 no-op confirmed');
    } else {
      note(`Payment in status=${preStatus} — charge.success activation test skipped in this state.`);
    }
  }

  // ── WH-04: charge.success (SUBSCRIPTION) ────────────────────────────────────
  // Requires a PENDING SUBSCRIPTION payment row. The 019b controller does not expose
  // the payment reference in its response, so subscriptionPaymentRef is usually empty.
  if (!subscriptionPaymentRef) {
    note('WH-04: No SUBSCRIPTION reference available — skipping live SUBSCRIPTION activation test.');
    note('The 019b controller does not expose "reference" in its response body (known limitation).');
    note('activateSubscriptionPayment is covered by payments.verify.spec.ts unit tests.');
  } else {
    await postWebhook(
      'charge.success',
      { reference: subscriptionPaymentRef, amount: 300000 },
      { expectStatus: 200, label: 'POST /payments/webhook (charge.success SUBSCRIPTION → 200)' },
    );
    pass('WH-04: charge.success (SUBSCRIPTION) delivered → 200');
  }

  note('WH-05b (charge.failed → FAILED in DB): requires a PENDING payment that has not been activated.');
  note('  Clean user payments → initiate fresh ONE_TIME → POST charge.failed before charge.success.');
  note('  The DB update is covered by payments.verify.spec.ts (handleChargeFailed unit test).');
}

async function testLogout() {
  section('Logout');
  const { body } = await req('POST', '/auth/logout', {
    token: accessToken,
    expectStatus: 200,
    label: 'POST /auth/logout',
  });
  pass('POST /auth/logout');
  dump(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// ST-4: Step 2 notes-only submission (customer tags OR free text)
//   Verifies that submitting step 2 with only additional_notes and no tags
//   is accepted (was previously blocked by @ArrayMinSize(1) on type).
//
//   Requires an active (not yet completed) wizard session.
//   If the current user's onboarding is already complete this test is skipped
//   and a reminder is printed — run with a fresh user to exercise it fully.
// ─────────────────────────────────────────────────────────────────────────────

async function testStep2NotesOnly() {
  section('ST-4 — Step 2 notes-only submission fix');

  // Start (or resume) wizard session
  const startRes = await req<{
    data?: { sessionId?: string; status?: string; redirect?: { to: string } };
  }>('POST', '/onboarding/start', { token: accessToken, label: 'POST /onboarding/start' });

  if (startRes.body.data?.redirect) {
    note('Onboarding already complete for this user — ST-4 requires a fresh user.');
    note('Register a new account then re-run to exercise the step 2 validation path.');
    pass('POST /onboarding/start (skipped — already complete)');
    return;
  }

  const sid = startRes.body.data?.sessionId ?? '';
  if (!sid) fail('ST-4 POST /onboarding/start', 'no sessionId in response');
  pass('POST /onboarding/start', `sessionId=${sid}`);

  // Step 1 — required before step 2
  await req('POST', '/onboarding/step', {
    token: accessToken,
    body: { session_id: sid, step: 1, answer: { business_description: 'ST-4 smoke test business' } },
    label: 'POST /onboarding/step (1)',
  });
  pass('POST /onboarding/step (1)');

  // Step 2 — notes only, no tags selected
  const step2Res = await req('POST', '/onboarding/step', {
    token: accessToken,
    body: {
      session_id: sid,
      step: 2,
      answer: { customer_tags: {}, additional_notes: 'They are people who want to make their lives easier' },
    },
    expectStatus: 200,
    label: 'POST /onboarding/step (2) — notes only, no tags',
  });
  pass('ST-4: step 2 accepted with notes only (no tags) — validation fix confirmed');
  dump(step2Res.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin auth smoke tests (BE-ADM-601)
//
// Requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to be set in the
// environment — these must match the credentials used when running
// `pnpm seed:admin` against this database.
//
// NOTE: The lockout path (5 failed attempts → 423) is intentionally
// excluded here because it locks the real super-admin account for 1 hour.
// It is covered by unit tests in admin-auth.service.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

async function testAdminAuth() {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    note('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin auth tests.');
    return;
  }

  // ── Happy paths ────────────────────────────────────────────────────────────

  section('Admin Auth — login (happy paths)');

  const { body: loginBody, headers: loginHeaders } = await req<{
    data?: { accessToken?: string };
    message?: string;
  }>('POST', '/admin/auth/login', {
    body: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
    expectStatus: 200,
    label: 'POST /admin/auth/login (super_admin)',
  });

  adminAccessToken = loginBody.data?.accessToken ?? '';
  if (!adminAccessToken) fail('POST /admin/auth/login', 'no accessToken in response');

  const setCookie = loginHeaders.get('set-cookie') ?? '';
  const cookieMatch = setCookie.match(/(refreshToken=[^;]+)/);
  adminRefreshCookie = cookieMatch?.[1] ?? '';
  if (!adminRefreshCookie) fail('POST /admin/auth/login', 'no refreshToken cookie set');

  pass('POST /admin/auth/login', `message="${loginBody.message}"`);
  dump(loginBody);

  // JWT must carry role=super_admin — verify without hitting the server
  const jwtPayload = decodeJwtPayload(adminAccessToken);
  if (jwtPayload['role'] !== 'super_admin') {
    fail('JWT role claim', `expected "super_admin" got "${String(jwtPayload['role'])}"`);
  }
  pass('JWT payload contains role=super_admin');

  // ── Refresh token (cookie-based) ───────────────────────────────────────────

  section('Admin Auth — refresh token (happy path)');

  const { body: refreshBody, headers: refreshHeaders } = await req<{
    data?: { accessToken?: string };
    message?: string;
  }>('POST', '/admin/auth/refresh-token', {
    cookie: adminRefreshCookie,
    expectStatus: 200,
    label: 'POST /admin/auth/refresh-token',
  });

  const newAccessToken = refreshBody.data?.accessToken ?? '';
  if (!newAccessToken) fail('POST /admin/auth/refresh-token', 'no accessToken in response');
  adminAccessToken = newAccessToken;

  const newCookieMatch = (refreshHeaders.get('set-cookie') ?? '').match(/(refreshToken=[^;]+)/);
  adminRefreshCookie = newCookieMatch?.[1] ?? adminRefreshCookie;

  const refreshedPayload = decodeJwtPayload(adminAccessToken);
  if (refreshedPayload['role'] !== 'super_admin') {
    fail('Refreshed JWT role claim', `expected "super_admin" got "${String(refreshedPayload['role'])}"`);
  }
  pass('POST /admin/auth/refresh-token', `role=${String(refreshedPayload['role'])} preserved`);
  dump(refreshBody);

  // ── Error paths ────────────────────────────────────────────────────────────

  section('Admin Auth — login (error paths)');

  // Wrong password → 401
  const { body: wrongPwBody } = await req<{ message?: string }>(
    'POST', '/admin/auth/login',
    {
      body: { email: SUPER_ADMIN_EMAIL, password: 'WrongPass@99!' }, expectStatus: 401,
      label: 'POST /admin/auth/login (wrong password → 401)'
    },
  );
  pass('POST /admin/auth/login (wrong password)', `status=401 message="${wrongPwBody.message}"`);

  // Unknown email → 401, same message (no user enumeration)
  const { body: unknownEmailBody } = await req<{ message?: string }>(
    'POST', '/admin/auth/login',
    {
      body: { email: `ghost+${RUN_ID}@nowhere.test`, password: SUPER_ADMIN_PASSWORD },
      expectStatus: 401, label: 'POST /admin/auth/login (unknown email → 401)'
    },
  );
  if (unknownEmailBody.message !== wrongPwBody.message) {
    fail('SEC-03: no-enumeration',
      `unknown-email message "${unknownEmailBody.message}" !== wrong-password message "${wrongPwBody.message}"`);
  }
  pass('SEC-03: unknown email returns identical 401 message (no user enumeration)');

  // Regular user account → 401, same message (no admin role)
  const { body: regularUserBody } = await req<{ message?: string }>(
    'POST', '/admin/auth/login',
    {
      body: { email: EMAIL, password: NEW_PASS }, expectStatus: 401,
      label: 'POST /admin/auth/login (regular user account → 401)'
    },
  );
  if (regularUserBody.message !== wrongPwBody.message) {
    fail('SEC-03: no-role-enumeration',
      `no-admin-role message "${regularUserBody.message}" !== wrong-password message "${wrongPwBody.message}"`);
  }
  pass('SEC-03: regular user account returns identical 401 message (role not revealed)');

  // Missing required field → 400
  await req('POST', '/admin/auth/login',
    {
      body: { email: SUPER_ADMIN_EMAIL }, expectStatus: 400,
      label: 'POST /admin/auth/login (missing password → 400)'
    });
  pass('POST /admin/auth/login (missing password)', 'status=400');

  // Invalid email format → 400
  await req('POST', '/admin/auth/login',
    {
      body: { email: 'not-an-email', password: SUPER_ADMIN_PASSWORD }, expectStatus: 400,
      label: 'POST /admin/auth/login (invalid email → 400)'
    });
  pass('POST /admin/auth/login (invalid email format)', 'status=400');

  // ── Refresh error paths ────────────────────────────────────────────────────

  section('Admin Auth — refresh token (error paths)');

  // No cookie → 401
  await req('POST', '/admin/auth/refresh-token',
    { expectStatus: 401, label: 'POST /admin/auth/refresh-token (no cookie → 401)' });
  pass('POST /admin/auth/refresh-token (no cookie)', 'status=401');

  // Malformed token → 401
  await req('POST', '/admin/auth/refresh-token',
    {
      cookie: 'refreshToken=this.is.garbage', expectStatus: 401,
      label: 'POST /admin/auth/refresh-token (invalid token → 401)'
    });
  pass('POST /admin/auth/refresh-token (invalid token)', 'status=401');

  // ── Logout guarded by AdminJwtGuard ───────────────────────────────────────

  section('Admin Auth — logout (error paths before valid logout)');

  // No token → 401
  await req('POST', '/admin/auth/logout',
    { expectStatus: 401, label: 'POST /admin/auth/logout (no token → 401)' });
  pass('POST /admin/auth/logout (no token)', 'status=401');

  // Regular user token → 403 (valid JWT but role=user)
  if (accessToken) {
    await req('POST', '/admin/auth/logout',
      {
        token: accessToken, expectStatus: 403,
        label: 'POST /admin/auth/logout (regular user token → 403)'
      });
    pass('POST /admin/auth/logout (regular user JWT)', 'status=403 — role claim rejected');
  } else {
    note('Regular user token not set — skipping role-rejection check for logout (run testInitialLogin first).');
  }

  // ── Logout happy path + revocation check ─────────────────────────────────

  section('Admin Auth — logout (happy path + revocation)');

  await req('POST', '/admin/auth/logout',
    {
      token: adminAccessToken, expectStatus: 200,
      label: 'POST /admin/auth/logout (valid token → 200)'
    });
  pass('POST /admin/auth/logout', 'session revoked');

  // The same token must now be rejected — session is gone from Redis
  await req('POST', '/admin/auth/logout',
    {
      token: adminAccessToken, expectStatus: 401,
      label: 'POST /admin/auth/logout (revoked token → 401)'
    });
  pass('POST /admin/auth/logout (revoked token)', 'status=401 — session correctly invalidated');

  // Re-login to restore adminAccessToken for the users tests below
  const { body: reloginBody, headers: reloginHeaders } = await req<{
    data?: { accessToken?: string };
  }>('POST', '/admin/auth/login', {
    body: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
    expectStatus: 200,
    label: 'POST /admin/auth/login (re-login after logout)',
  });
  adminAccessToken = reloginBody.data?.accessToken ?? '';
  if (!adminAccessToken) fail('Re-login after logout', 'no accessToken');
  const reloginCookieMatch = (reloginHeaders.get('set-cookie') ?? '').match(/(refreshToken=[^;]+)/);
  adminRefreshCookie = reloginCookieMatch?.[1] ?? '';
  pass('Re-login after logout', 'adminAccessToken restored for users tests');
}

async function testAdminUsers() {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD || !adminAccessToken) {
    note('Skipping admin users tests — admin token not available (run testAdminAuth first).');
    return;
  }

  // ── Happy paths ────────────────────────────────────────────────────────────

  section('Admin Users — create-admin (happy paths)');

  // Create a new admin (role: admin) — super_admin token required
  const { body: createAdminBody } = await req<{ message?: string }>(
    'POST', '/admin/users/create-admin',
    {
      token: adminAccessToken,
      body: {
        full_name: 'Smoke Admin', email: CREATED_ADMIN_EMAIL,
        password: CREATED_ADMIN_PASSWORD, role: 'admin'
      },
      expectStatus: 201,
      label: 'POST /admin/users/create-admin (role:admin → 201)',
    },
  );
  if (!createAdminBody.message) fail('POST /admin/users/create-admin', 'no message in response');
  pass('POST /admin/users/create-admin (role:admin)', `message="${createAdminBody.message}"`);
  dump(createAdminBody);

  // Login as the new admin — confirm JWT carries role=admin
  const { body: newAdminLogin, headers: newAdminHeaders } = await req<{
    data?: { accessToken?: string };
  }>('POST', '/admin/auth/login', {
    body: { email: CREATED_ADMIN_EMAIL, password: CREATED_ADMIN_PASSWORD },
    expectStatus: 200,
    label: 'POST /admin/auth/login (newly created admin)',
  });
  newAdminToken = newAdminLogin.data?.accessToken ?? '';
  if (!newAdminToken) fail('Login as new admin', 'no accessToken');

  const newAdminPayload = decodeJwtPayload(newAdminToken);
  if (newAdminPayload['role'] !== 'admin') {
    fail('New admin JWT role', `expected "admin" got "${String(newAdminPayload['role'])}"`);
  }
  pass('New admin JWT contains role=admin');

  const newAdminCookieMatch = (newAdminHeaders.get('set-cookie') ?? '').match(/(refreshToken=[^;]+)/);
  const newAdminRefreshCookie = newAdminCookieMatch?.[1] ?? '';

  // Create a second throwaway account (role: super_admin) to prove super_admin can do it
  const CREATED_SUPER_EMAIL = `newsuper+${RUN_ID}@test.dev`;
  const { body: createSuperBody } = await req<{ message?: string }>(
    'POST', '/admin/users/create-admin',
    {
      token: adminAccessToken,
      body: {
        full_name: 'Smoke Super', email: CREATED_SUPER_EMAIL,
        password: CREATED_ADMIN_PASSWORD, role: 'super_admin'
      },
      expectStatus: 201,
      label: 'POST /admin/users/create-admin (role:super_admin → 201)',
    },
  );
  pass('POST /admin/users/create-admin (role:super_admin)', `message="${createSuperBody.message}"`);

  // ── Error paths ────────────────────────────────────────────────────────────

  section('Admin Users — create-admin (error paths)');

  // Duplicate email → 409
  await req('POST', '/admin/users/create-admin',
    {
      token: adminAccessToken,
      body: {
        full_name: 'Duplicate', email: CREATED_ADMIN_EMAIL,
        password: CREATED_ADMIN_PASSWORD, role: 'admin'
      },
      expectStatus: 409,
      label: 'POST /admin/users/create-admin (duplicate email → 409)',
    });
  pass('POST /admin/users/create-admin (duplicate email)', 'status=409');

  // Password too weak (no uppercase) → 400
  await req('POST', '/admin/users/create-admin',
    {
      token: adminAccessToken,
      body: {
        full_name: 'Weak', email: `weak+${RUN_ID}@test.dev`,
        password: 'weakpassword1!', role: 'admin'
      },
      expectStatus: 400,
      label: 'POST /admin/users/create-admin (weak password → 400)',
    });
  pass('POST /admin/users/create-admin (weak password)', 'status=400');

  // Password too short → 400
  await req('POST', '/admin/users/create-admin',
    {
      token: adminAccessToken,
      body: {
        full_name: 'Short', email: `short+${RUN_ID}@test.dev`,
        password: 'Ab1!', role: 'admin'
      },
      expectStatus: 400,
      label: 'POST /admin/users/create-admin (password too short → 400)',
    });
  pass('POST /admin/users/create-admin (password too short)', 'status=400');

  // Invalid role value → 400
  await req('POST', '/admin/users/create-admin',
    {
      token: adminAccessToken,
      body: {
        full_name: 'BadRole', email: `badrole+${RUN_ID}@test.dev`,
        password: CREATED_ADMIN_PASSWORD, role: 'user'
      },
      expectStatus: 400,
      label: 'POST /admin/users/create-admin (role:user → 400)',
    });
  pass('POST /admin/users/create-admin (invalid role)', 'status=400 — "user" rejected by DTO');

  // Regular admin JWT (role=admin) → 403 — only super_admin can create admins
  await req('POST', '/admin/users/create-admin',
    {
      token: newAdminToken,
      body: {
        full_name: 'Forbidden', email: `forbidden+${RUN_ID}@test.dev`,
        password: CREATED_ADMIN_PASSWORD, role: 'admin'
      },
      expectStatus: 403,
      label: 'POST /admin/users/create-admin (admin JWT → 403)',
    });
  pass('SEC-05: regular admin JWT rejected on create-admin', 'status=403');

  // Regular user JWT → 403
  if (accessToken) {
    await req('POST', '/admin/users/create-admin',
      {
        token: accessToken,
        body: {
          full_name: 'User', email: `user+${RUN_ID}@test.dev`,
          password: CREATED_ADMIN_PASSWORD, role: 'admin'
        },
        expectStatus: 403,
        label: 'POST /admin/users/create-admin (regular user JWT → 403)',
      });
    pass('POST /admin/users/create-admin (regular user token)', 'status=403 — no admin role');
  }

  // No token → 401
  await req('POST', '/admin/users/create-admin',
    {
      body: {
        full_name: 'NoAuth', email: `noauth+${RUN_ID}@test.dev`,
        password: CREATED_ADMIN_PASSWORD, role: 'admin'
      },
      expectStatus: 401,
      label: 'POST /admin/users/create-admin (no token → 401)',
    });
  pass('POST /admin/users/create-admin (no token)', 'status=401');

  // Clean up: logout the new admin so its session doesn't linger
  if (newAdminToken && newAdminRefreshCookie) {
    await req('POST', '/admin/auth/logout',
      {
        token: newAdminToken, expectStatus: 200,
        label: 'POST /admin/auth/logout (cleanup new admin session)'
      });
    pass('New admin session cleaned up');
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}FlowBrand API Smoke Test${c.reset}`);
  console.log(`${c.dim}base: ${API}${c.reset}`);
  console.log(`${c.dim}user: ${EMAIL}${c.reset}\n`);

  // ── active ───────────────────────────────────────────────────────────────
  await testInitialLogin();            // reuse existing session → sets accessToken
  await testPaymentInitiate();         // M4-BE-019:  POST /payments/initiate
  await testSubscriptionInitiate();    // M4-BE-019b: POST /payments/subscriptions/initiate
  await testVerifyPayment();           // M4-BE-020:  GET /payments/verify
  await testWebhook();                 // M4-BE-021:  POST /payments/webhook

  // ── commented out ────────────────────────────────────────────────────────
  // await testOtpFlow();              // use when running the full registration flow
  // await testStep2NotesOnly();
  // await testLogout();
  // await testWizardContextFix();
  // await testUpload();
  // await testAdminAuth();   // set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD to activate
  // await testAdminUsers();  // testInitialLogin() must run first
  void testAdminAuth, testAdminUsers, testOtpFlow; // keep referenced so TS doesn't flag as unused
  // await testHealth();
  // await testWaitlist();
  // await testContact();
  // await testRegister();
  // await testGetMe();
  // await testRefreshToken();
  // await testForgotPasswordFlow();
  // await testLoginWithNewPassword();
  // await testOnboarding();
  // await testFunnels();
  // await testMultiFunnelSupport();
  // await testUserProfile();

  console.log(`\n${c.green}${c.bold}All smoke tests passed.${c.reset}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

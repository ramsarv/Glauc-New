/**
 * Glauc API Service v2 — typed client for all endpoints.
 * Handles auth headers, timeouts, 401 session expiry, and Stripe payment flow.
 */

import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const TOKEN_KEY       = 'glauc_auth_token';
const DEFAULT_TIMEOUT = 30_000;
const SCAN_TIMEOUT    = 90_000;

// ── Token management ──────────────────────────────────────────
export async function getToken() {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}
export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ── Core fetch helper ─────────────────────────────────────────
async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const token   = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 401) {
      await clearToken();
      throw new Error('SESSION_EXPIRED');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  }
}

// ── Auth ──────────────────────────────────────────────────────
export const apiLogin        = (email, password)   => request('/auth/login',   { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
export const apiRegister     = (email, password, name) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password, name }) });
export const apiLoginGoogle  = (idToken)           => request('/auth/google',  { method: 'POST', body: JSON.stringify({ id_token: idToken }) });
export const apiLoginApple   = (identityToken, name) => request('/auth/apple', { method: 'POST', body: JSON.stringify({ identity_token: identityToken, name }) });
export const apiGetMe        = ()                  => request('/auth/me');

// ── Scan ──────────────────────────────────────────────────────
export async function apiScan(imageUri, metadata) {
  const token = await getToken();
  const form  = new FormData();
  form.append('file',   { uri: imageUri, type: 'image/jpeg', name: 'eye.jpg' });
  form.append('gender', metadata.gender);
  form.append('race',   metadata.race);
  form.append('age',    String(parseInt(metadata.age)));

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), SCAN_TIMEOUT);

  try {
    const res = await fetch(`${API_URL}/scan`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    form,
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 401) { await clearToken(); throw new Error('SESSION_EXPIRED'); }
    if (res.status === 422) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.reason || 'Image quality check failed. Please retake.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Scan failed (${res.status})`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Scan timed out. Please check your connection.');
    throw err;
  }
}

// ── Explanation polling ───────────────────────────────────────
export const apiGetExplanation = (jobId) => request(`/scan/explain/${encodeURIComponent(jobId)}`);

// ── History & trend ───────────────────────────────────────────
export const apiGetHistory = (page = 0) => request(`/history?page=${page}`);
export const apiGetTrend   = ()         => request('/trend');

// ── Reminders ─────────────────────────────────────────────────
export const apiSetReminder = (enabled) => request('/reminder', { method: 'POST', body: JSON.stringify({ enabled }) });

// ── Subscription / Stripe ─────────────────────────────────────

/**
 * Create a Stripe PaymentIntent for the given plan.
 * Returns { clientSecret, paymentIntentId }
 */
export const apiCreatePaymentIntent = (planId) =>
  request('/subscription/create-payment-intent', {
    method: 'POST',
    body:   JSON.stringify({ plan_id: planId }),
  });

/**
 * Activate subscription after successful payment.
 * Server verifies payment intent status with Stripe before activating.
 */
export const apiActivateSubscription = (paymentIntentId, planId) =>
  request('/subscription/activate', {
    method: 'POST',
    body:   JSON.stringify({ payment_intent_id: paymentIntentId, plan_id: planId }),
  });

/**
 * Get current subscription status and billing portal URL.
 * Returns { status, plan, currentPeriodEnd, portalUrl } or null
 */
export const apiGetSubscription = () =>
  request('/subscription/status').catch(() => null);

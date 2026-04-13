/**
 * Glauc API Service
 * Central client for all network requests.
 * Handles auth headers, timeouts, session expiry, and form-data uploads.
 */

import * as SecureStore from 'expo-secure-store';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const TOKEN_KEY = 'glauc_auth_token';
const DEFAULT_TIMEOUT = 30_000;
const SCAN_TIMEOUT    = 90_000;

// ── Token management (SecureStore — encrypted on device) ──────
export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
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
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
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
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  }
}

// ── Auth endpoints ────────────────────────────────────────────
export async function apiLogin(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

export async function apiRegister(email, password, name) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, name }),
  });
}

export async function apiLoginGoogle(idToken) {
  return request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function apiLoginApple(identityToken, name) {
  return request('/auth/apple', {
    method: 'POST',
    body: JSON.stringify({ identity_token: identityToken, name }),
  });
}

export async function apiGetMe() {
  return request('/auth/me');
}

// ── Scan endpoint (multipart form-data) ───────────────────────
export async function apiScan(imageUri, metadata) {
  const token = await getToken();

  const formData = new FormData();
  formData.append('file', {
    uri:  imageUri,
    type: 'image/jpeg',
    name: 'eye.jpg',
  });
  formData.append('gender', metadata.gender);
  formData.append('race',   metadata.race);
  formData.append('age',    String(parseInt(metadata.age)));

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), SCAN_TIMEOUT);

  try {
    const res = await fetch(`${API_URL}/scan`, {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    formData,
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 401) {
      await clearToken();
      throw new Error('SESSION_EXPIRED');
    }
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
    if (err.name === 'AbortError') {
      throw new Error('Scan timed out. Please check your connection and try again.');
    }
    throw err;
  }
}

// ── Explanation polling ───────────────────────────────────────
export async function apiGetExplanation(jobId) {
  return request(`/scan/explain/${encodeURIComponent(jobId)}`);
}

// ── History & trend ───────────────────────────────────────────
export async function apiGetHistory(page = 0) {
  return request(`/history?page=${page}`);
}

export async function apiGetTrend() {
  return request('/trend');
}

// ── Reminders ─────────────────────────────────────────────────
export async function apiSetReminder(enabled) {
  return request('/reminder', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

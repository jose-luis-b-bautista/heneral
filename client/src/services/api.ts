import type { PublicUser } from '../types';

const TOKEN_KEY = 'salpakan-token';

export function getServerUrl(): string {
  const raw = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (!raw) {
    // Same-origin by default: the Vite dev proxy forwards /api and /socket.io
    // to the local backend, and production sets VITE_SERVER_URL explicitly.
    return '';
  }
  return raw.replace(/\/+$/, '');
}

export function getSocketUrl(): string {
  return getServerUrl();
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${getServerUrl()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as T & { error?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: { username, password }, auth: false }),
  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => request<{ user: PublicUser }>('/api/users/me'),
};

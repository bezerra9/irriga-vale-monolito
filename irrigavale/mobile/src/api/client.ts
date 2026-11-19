import { API_URL } from '../config';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
const REQUEST_TIMEOUT_MS = 15_000;

export function setAuthToken(value: string | null): void {
  token = value;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function messageFrom(status: number, data: unknown): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const fields = detail
        .map((item) => (item && typeof item === 'object' && 'loc' in item ? String((item as { loc: unknown[] }).loc.at(-1)) : null))
        .filter(Boolean)
        .join(', ');
      return fields ? `Revise os campos: ${fields}.` : 'Revise os dados informados.';
    }
  }
  if (status === 0 || status >= 500) return 'Não foi possível falar com o servidor. Tente novamente.';
  return 'Algo deu errado. Tente novamente.';
}

export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized?.();
    throw new ApiError(response.status, messageFrom(response.status, data));
  }
  return data as T;
}

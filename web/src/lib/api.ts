// Thin client for the Express API. Credentials are sent as the same-origin session
// cookie. Nothing secret is stored in the browser, and no provider keys exist here.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';

export async function api<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('bulkskart:unauthorised'));
    }
    throw new ApiError(response.status, payload.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export const get = <T,>(path: string) => api<T>('GET', path);
export const post = <T,>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const patch = <T,>(path: string, body?: unknown) => api<T>('PATCH', path, body ?? {});
export const put = <T,>(path: string, body?: unknown) => api<T>('PUT', path, body ?? {});

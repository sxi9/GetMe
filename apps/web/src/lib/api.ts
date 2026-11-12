// Thin fetch wrapper. Same-origin `/api` in dev (Vite proxies to :4000); set VITE_API_URL for a hosted API.
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };
export const getToken = () => token;

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(API_URL + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error ?? 'error', data.message ?? r.statusText, r.status);
  return data as T;
}
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

/** Read a File as a data URL and upload it; returns the served URL. */
export async function uploadFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
  const r = await post<{ url: string }>('/api/uploads', { dataUrl, name: file.name });
  return r.url;
}
export const wsUrl = (q: string) => { const base = API_URL ? API_URL.replace(/^http/, 'ws') : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; return `${base}/ws?${q}`; };

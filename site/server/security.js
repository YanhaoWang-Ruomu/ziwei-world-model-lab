export const now = () => Math.floor(Date.now() / 1000);
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function identity(request, env) {
  // Only the Sites gateway authenticates these headers. Standalone hosting must ignore them.
  if (env.AUTH_MODE === 'standalone') return { id: '', owner: false };
  const id = request.headers.get('oai-authenticated-user-id') || '';
  const email = request.headers.get('oai-authenticated-user-email') || '';
  return { id, owner: Boolean(id && email && env.OWNER_EMAIL && email.toLowerCase() === env.OWNER_EMAIL.toLowerCase()) };
}
export function assertOrigin(request) {
  // All browser writes require a same-origin request, including key redemption.
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, '请求来源不符，请从本站操作。');
}
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function bodyBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new HttpError(413, '内容超过本次提交大小限制。'); }
    chunks.push(value);
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export async function jsonBody(request, limit = 1024 * 1024) {
  try { return JSON.parse(new TextDecoder().decode(await bodyBytes(request, limit))); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, '提交内容格式不正确。'); }
}
export function safeText(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, '文字为空或超过长度限制。');
  return value;
}
export function positiveInt(value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new HttpError(400, '页数或文件大小不正确。');
  return value;
}
export function onlineLevel(value) {
  if (!['public', 'special'].includes(value)) throw new HttpError(400, '私密材料请在本机书库添加。');
  return value;
}

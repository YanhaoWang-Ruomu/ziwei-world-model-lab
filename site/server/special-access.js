import { now, digest, randomToken, jsonBody, HttpError } from './security.js';

const cookieName = '__Host-ziwei_special';
const sessionSeconds = 8 * 3600;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');

function configuration(env) {
  try {
    const value = JSON.parse(env.SPECIAL_ACCOUNT || 'null');
    if (value && typeof value.username === 'string' && value.username.length > 0 && value.username.length <= 64 && /^[a-f0-9]{64}$/.test(value.salt) && /^[a-f0-9]{64}$/.test(value.hash) && /^[a-f0-9-]{36}$/.test(value.version)) return value;
  } catch { /* A missing or invalid secret never grants access. */ }
  return null;
}

export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256));
}

function sameHash(left, right) {
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function sessionHash(request) {
  const token = (request.headers.get('cookie') || '').match(/(?:^|;\s*)__Host-ziwei_special=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token ? digest(token) : '';
}

export async function specialAccess(request, env) {
  const config = configuration(env);
  const hash = config ? await sessionHash(request) : '';
  if (!hash || !env.DB) return false;
  return Boolean(await env.DB.prepare('SELECT hash FROM special_sessions WHERE hash=? AND credential_version=? AND expires_at>?').bind(hash, config.version, now()).first());
}

export async function specialSubject(request, env) {
  if (!await specialAccess(request,env)) return '';
  return digest(`special-account:${configuration(env).version}`);
}

async function limitLogin(request, db, version) {
  const time = now();
  // Only the platform's connection address is used; client-supplied forwarding headers are ignored.
  const address = request.headers.get('cf-connecting-ip') || 'unknown';
  const addressHash = await digest(`${version}:${address}`);
  const limits = [{ key: `special:ip:${addressHash}`, seconds: 900, count: 10 }, { key: 'special:all', seconds: 60, count: 120 }];
  const results = await db.batch(limits.map(limit => db.prepare('INSERT INTO login_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts').bind(limit.key, time + limit.seconds, time, time)));
  if (results.some((result, i) => result.results[0].attempts > limits[i].count)) throw new HttpError(429, '尝试次数过多，请稍后再试。');
}

export async function loginSpecial(request, env, db) {
  const config = configuration(env);
  if (!config) throw new HttpError(503, '特殊书库账号暂未配置，请联系主人。');
  await limitLogin(request, db, config.version);
  const data = await jsonBody(request, 4096);
  if (!data || typeof data.username !== 'string' || data.username.length > 64 || typeof data.password !== 'string' || !data.password || data.password.length > 256) throw new HttpError(403, '账号或密码不正确。');
  const [actual, suppliedUser, expectedUser] = await Promise.all([passwordHash(data.password, config.salt), digest(data.username), digest(config.username)]);
  if (!(sameHash(actual, config.hash) & sameHash(suppliedUser, expectedUser))) throw new HttpError(403, '账号或密码不正确。');
  const token = randomToken();
  const previous = await sessionHash(request);
  await db.batch([
    db.prepare('DELETE FROM special_sessions WHERE expires_at<=? OR hash=?').bind(now(), previous),
    db.prepare('DELETE FROM login_attempts WHERE expires_at<=?').bind(now()),
    db.prepare('INSERT INTO special_sessions (hash,credential_version,expires_at) VALUES (?,?,?)').bind(await digest(token), config.version, now() + sessionSeconds),
  ]);
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionSeconds}`;
}

export async function logoutSpecial(request, db) {
  const hash = await sessionHash(request);
  if (hash) await db.prepare('DELETE FROM special_sessions WHERE hash=?').bind(hash).run();
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

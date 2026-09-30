export function validateEnvironment(values: Record<string, unknown>) {
  const port = Number(values.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const origin = String(values.FRONTEND_ORIGIN ?? 'http://localhost:3000');
  let frontendUrl: URL;
  try {
    frontendUrl = new URL(origin);
  } catch {
    throw new Error('FRONTEND_ORIGIN must be a valid HTTP or HTTPS origin.');
  }
  if (!['http:', 'https:'].includes(frontendUrl.protocol) || frontendUrl.origin !== origin) {
    throw new Error('FRONTEND_ORIGIN must contain only the HTTP or HTTPS origin, without a trailing slash.');
  }

  const databaseUrl = String(values.DATABASE_URL ?? '');
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
      throw new Error('Invalid database URL');
    }
  } catch {
    throw new Error('Set a valid PostgreSQL DATABASE_URL in backend/.env. Run npm run setup first.');
  }

  const lifetime = Number(values.SESSION_TTL_HOURS ?? 12);
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > 168) throw new Error('SESSION_TTL_HOURS must be between 1 and 168.');
  const secure = String(values.SESSION_COOKIE_SECURE ?? (values.NODE_ENV === 'production' ? 'true' : 'false'));
  if (!['true', 'false'].includes(secure)) throw new Error('SESSION_COOKIE_SECURE must be true or false.');
  if (values.NODE_ENV === 'production' && (secure !== 'true' || frontendUrl.protocol !== 'https:')) {
    throw new Error('Production authentication requires HTTPS FRONTEND_ORIGIN and secure cookies.');
  }
  return { ...values, PORT: port, HOST: String(values.HOST ?? '127.0.0.1'), FRONTEND_ORIGIN: origin, DATABASE_URL: databaseUrl,
    SESSION_TTL_HOURS: lifetime, SESSION_COOKIE_SECURE: secure === 'true' };
}

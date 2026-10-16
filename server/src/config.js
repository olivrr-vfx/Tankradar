/** Configuration via environment variables (see .env.example). */
export function loadConfig(env = process.env) {
  const regions = (env.REGIONS ?? '')
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [lat, lng, rad = '10'] = r.split(',').map((x) => Number(x.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`Invalid region "${r}" (expected lat,lng[,radiusKm])`);
      return { lat, lng, rad: Math.min(25, Math.max(1, Number(rad) || 10)) };
    });
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    apiKey: env.TANKERKOENIG_API_KEY ?? '',
    apiBase: env.TANKERKOENIG_BASE ?? 'https://creativecommons.tankerkoenig.de/json',
    dbPath: env.DB_PATH ?? './data/tankradar.db',
    regions,
    // Tankerkönig asks for at most one automated request per station every 5 minutes.
    pollMinutes: Math.max(5, Number(env.POLL_INTERVAL_MIN ?? 10)),
    liveCacheSeconds: Math.max(60, Number(env.LIVE_CACHE_SEC ?? 300)),
    retentionDays: Number(env.RETENTION_DAYS ?? 400),
    corsOrigin: env.CORS_ORIGIN ?? '*',
    rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN ?? 120),
  };
}

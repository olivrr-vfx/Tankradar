/** Periodically polls configured regions so that complete price histories build up. */
export function startCollector({ db, client, config, log = console }) {
  if (!client || !config.regions.length) {
    log.info?.('collector: no regions configured – only on-demand caching is active');
    return () => {};
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    let changes = 0;
    try {
      for (const r of config.regions) {
        try {
          const list = await client.list(r.lat, r.lng, r.rad);
          changes += db.saveStations(list);
        } catch (e) {
          log.warn?.(`collector: region ${r.lat},${r.lng} failed: ${e.message}`);
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
      const pruned = db.prune(config.retentionDays);
      log.info?.(`collector: ${changes} price changes recorded${pruned ? `, ${pruned} old rows pruned` : ''}`);
    } finally {
      running = false;
    }
  };
  void run();
  const id = setInterval(run, config.pollMinutes * 60000);
  return () => clearInterval(id);
}

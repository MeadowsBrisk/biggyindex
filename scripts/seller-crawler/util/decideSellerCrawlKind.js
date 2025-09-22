function decideSellerCrawlKind({ seller, rec, env, force=false }){
  if (force) return { kind:'full', reason:'force' };
  const mode = (env.mode||'auto').toLowerCase();
  if (mode === 'full') return { kind:'full', reason:'mode' };
  if (mode === 'summary') return { kind:'summary', reason:'mode' };
  const now = Date.now();
  const recOk = rec && typeof rec === 'object' ? rec : {};
  const lastManifestoAt = recOk.lastManifestoAt ? Date.parse(recOk.lastManifestoAt) : 0;
  const lastSummaryAt = recOk.lastSummaryAt ? Date.parse(recOk.lastSummaryAt) : 0;
  const manStale = now - lastManifestoAt >= (env.manifestoRefreshHours * 3600 * 1000);
  const revStale = now - lastSummaryAt >= (env.reviewRefreshHours * 3600 * 1000);
  if (manStale) return { kind:'full', reason:'manifesto_stale' };
  if (revStale) return { kind:'summary', reason:'reviews_stale' };
  return { kind:'skip', reason:'fresh' };
}

module.exports = { decideSellerCrawlKind };



// Phase 1 ScoreBoard scaffold (no behavioural change in categorization outcomes)
// Provides a structured way to record scoring adjustments and reasons.
// Future phases will route all scoring through this; currently we ingest final scores for trace.

function createScoreBoard() {
  const categories = Object.create(null); // cat -> points
  const log = []; // chronological { cat, delta, total, reason }
  function ensure(cat) { if (categories[cat] == null) categories[cat] = 0; }
  function add(cat, pts, reason = '') { ensure(cat); categories[cat] += pts; log.push({ cat, delta: pts, total: categories[cat], reason }); }
  function demote(cat, pts, reason = '') { ensure(cat); categories[cat] -= pts; log.push({ cat, delta: -pts, total: categories[cat], reason }); if (categories[cat] <= 0) { delete categories[cat]; log.push({ cat, delta: 0, total: 0, reason: 'removed-nonpositive' }); } }
  function set(cat, val, reason='set-explicit') { categories[cat] = val; log.push({ cat, delta: 0, total: val, reason }); }
  function remove(cat, reason='removed-explicit') { if (categories[cat] != null) { delete categories[cat]; log.push({ cat, delta: 0, total: 0, reason }); } }
  function importFinal(finalScores) {
    for (const [cat, val] of Object.entries(finalScores || {})) {
      if (typeof val === 'number') set(cat, val, 'final-import');
    }
  }
  function snapshot() { return JSON.parse(JSON.stringify(categories)); }
  function trace() { return log.slice(); }
  return { add, demote, set, remove, importFinal, snapshot, trace };
}

module.exports = { createScoreBoard };


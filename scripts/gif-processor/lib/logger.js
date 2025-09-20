const logger = (QUIET, DEBUG) => {
  const base = (level, args) => { if (!QUIET) console[level](...args); };
  return {
    log: (...a) => base('log', a),
    warn: (...a) => base('warn', a),
    debug: (...a) => { if (DEBUG && !QUIET) console.debug('[debug]', ...a); },
  };
};
module.exports = { logger };


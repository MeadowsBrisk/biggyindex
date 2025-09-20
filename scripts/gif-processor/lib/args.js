// Argument parsing & configuration
const path = require('path');

const rawArgs = process.argv.slice(2);
const flags = {};
for (const a of rawArgs) {
  if (!a.startsWith('--')) continue;
  const [k, v] = a.slice(2).split('=');
  flags[k] = v === undefined ? true : v;
}
const toBool = v => (typeof v === 'boolean' ? v : ['1','true','yes','on'].includes(String(v).toLowerCase()));
const flagBool = (k,d=false)=> flags[k]===undefined?d:toBool(flags[k]);
const flagStr  = (k,d='')=> flags[k]===undefined?d:String(flags[k]);
const flagNum  = (k,d)=> { if(flags[k]===undefined) return d; const n=Number(flags[k]); return Number.isFinite(n)?n:d; };

const config = {
  FORCE: flagBool('force'),
  WANT_VIDEO: flagBool('video'),
  POSTER_ONLY: flagBool('poster-only', false),
  POSTER_FORMAT: flagStr('format','jpeg').toLowerCase(),
  POSTER_MAX_W: flagNum('poster-max-width', 800),
  VIDEO_MAX_W: flagNum('video-max-width', 800),
  VIDEO_CRF: flagNum('video-crf', 26),
  VIDEO_PRESET: flagStr('video-preset','veryfast'),
  VIDEO_FPS: flagNum('video-fps', 0),
  VIDEO_VSYNC: flagStr('video-vsync','auto'),
  INCLUDE_IMAGE_URLS: flagBool('include-image-urls', true),
  MAX_SIZE_MB: flagNum('max-size-mb', 15),
  CONCURRENCY: Math.max(1, flagNum('concurrency',4)),
  HASH_LEN: Math.min(40, Math.max(6, flagNum('hash-len',12))),
  RETRY: Math.max(0, flagNum('retry',2)),
  TIMEOUT_MS: flagNum('timeout-ms', 20000),
  LIMIT: flagNum('limit',0),
  FF_OVERRIDE: flagStr('ffmpeg', process.env.FFMPEG_PATH || ''),
  VERIFY_ONLY: flagBool('verify'),
  DRY_RUN: flagBool('dry-run'),
  QUIET: flagBool('quiet'),
  DEBUG: flagBool('debug'),
  ROOT: process.cwd(),
};

module.exports = { config, flags, flagBool, flagNum, flagStr };

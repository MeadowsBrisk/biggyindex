const sharp = require('sharp');

async function buildPoster(buffer, outPath, cfg){
  let img = sharp(buffer, { animated: true, pages: 1 });
  let meta = await img.metadata();
  if (meta.width > cfg.POSTER_MAX_W) {
    img = img.resize({ width: cfg.POSTER_MAX_W, withoutEnlargement: true });
    meta = await img.metadata();
  }
  let pipe = img.ensureAlpha();
  const format = ['jpeg','webp'].includes(cfg.POSTER_FORMAT) ? cfg.POSTER_FORMAT : 'jpeg';
  if (format === 'jpeg' && meta.hasAlpha) pipe = pipe.flatten({ background: '#ffffff' });
  pipe = format === 'jpeg' ? pipe.jpeg({ quality: 80, progressive: true }) : pipe.webp({ quality: 80 });
  if (!cfg.DRY_RUN) await pipe.toFile(outPath);
  return { width: meta.width || null, height: meta.height || null, frames: meta.pages || undefined };
}

module.exports = { buildPoster };

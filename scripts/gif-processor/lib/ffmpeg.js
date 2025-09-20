const { spawn, spawnSync } = require('child_process');
let ffmpegStatic = null; try { ffmpegStatic = require('ffmpeg-static'); } catch {}

function detectFfmpeg(overridePath, wantVideo, quiet){
  let cmd = 'ffmpeg'; let available=false; let reason='none';
  const tryCmd = c => { try { const r=spawnSync(c,['-hide_banner','-version'],{stdio:'ignore'}); return !r.error && r.status===0; } catch { return false; } };
  if (overridePath && tryCmd(overridePath)) { cmd=overridePath; available=true; reason='override'; }
  else if (!available && ffmpegStatic && tryCmd(ffmpegStatic)) { cmd=ffmpegStatic; available=true; reason='static'; }
  else if (!available && tryCmd('ffmpeg')) { cmd='ffmpeg'; available=true; reason='system'; }
  if (!available && wantVideo && !quiet) console.warn('[gif] ffmpeg unavailable');
  return { available, cmd, reason };
}

function runFfmpeg(cmd, args){
  return new Promise(res=>{ const proc=spawn(cmd,args,{stdio:['ignore','pipe','pipe']}); let stderr=''; proc.stderr.on('data',d=>stderr+=d); proc.on('error',e=>res({code:-1,stderr:e.message})); proc.on('close',code=>res({code,stderr})); });
}

async function transcodeMp4(buffer, outPath, cfg, ff){
  if (!ff.available) return { ok:false, error:'ffmpeg-missing' };
  if (cfg.DRY_RUN) return { ok:true };
  const fs = require('fs'); const path = require('path'); const os=require('os');
  const tmpIn=path.join(os.tmpdir(),'gifvid_'+Date.now()+'.gif'); const tmpOut=outPath+'.tmp.mp4';
  fs.writeFileSync(tmpIn, buffer);
  const scale=`scale='min(${cfg.VIDEO_MAX_W},iw)':-2:flags=lanczos`;
  const even='scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const filters=[scale]; if (cfg.VIDEO_FPS>0) filters.push(`fps=${cfg.VIDEO_FPS}`); filters.push(even);
  const chain=filters.join(',');
  const vsync = cfg.VIDEO_VSYNC==='auto' ? (cfg.VIDEO_FPS>0?'cfr':'vfr') : cfg.VIDEO_VSYNC;
  const args=['-y','-i',tmpIn,'-movflags','+faststart','-an','-sn','-vf',chain,'-c:v','libx264','-preset',cfg.VIDEO_PRESET,'-crf',String(cfg.VIDEO_CRF),'-pix_fmt','yuv420p','-vsync',vsync,'-f','mp4',tmpOut];
  const { code, stderr } = await runFfmpeg(ff.cmd,args);
  safeUnlink(tmpIn);
  if (code!==0){ safeUnlink(tmpOut); return { ok:false, error:'ffmpeg:'+code+(stderr?':'+stderr.split(/\n/).slice(-3).join(' ').trim():'') }; }
  try { fs.renameSync(tmpOut,outPath); } catch(e){ safeUnlink(tmpOut); return { ok:false, error:'rename:'+e.message }; }
  return { ok:true };
}

function safeUnlink(p){ try{ fs.unlinkSync(p); }catch{} }

module.exports = { detectFfmpeg, transcodeMp4 };


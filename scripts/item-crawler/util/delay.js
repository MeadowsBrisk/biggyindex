function delay(ms, signal){
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('aborted'));
    const t = setTimeout(()=> resolve(), ms);
    if (signal) signal.addEventListener('abort', ()=> { clearTimeout(t); reject(new Error('aborted')); });
  });
}
function jitter(base, spread){ return base + Math.floor(Math.random()* (spread||0)); }
module.exports = { delay, jitter };


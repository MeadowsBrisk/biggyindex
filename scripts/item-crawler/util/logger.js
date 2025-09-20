const levels = ['debug','info','warn','error'];
let currentLevel = 'info';
function setLogLevel(lvl){ if(levels.includes(lvl)) currentLevel = lvl; }
function should(lvl){ return levels.indexOf(lvl) >= levels.indexOf(currentLevel); }
function fmt(level,msg){ const ts = new Date().toISOString(); return `[crawler][${level}] ${ts} ${msg}`; }
module.exports = {
  setLogLevel,
  debug:(m)=>{ if(should('debug')) console.log(fmt('debug',m)); },
  info:(m)=>{ if(should('info')) console.log(fmt('info',m)); },
  warn:(m)=>{ if(should('warn')) console.warn(fmt('warn',m)); },
  error:(m)=>{ if(should('error')) console.error(fmt('error',m)); },
};


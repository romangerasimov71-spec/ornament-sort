// Performance: frames per second and main-thread load (method from the tech review).
const { chromium } = require('playwright');
const U = process.env.GAME_URL || 'http://127.0.0.1:8765/index.html';
(async()=>{
 const b=await chromium.launch();
 for(const [w,h,dpr] of [[390,844,2],[1366,768,1],[1920,1080,2]]){
 const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr});
 const p=await ctx.newPage(); const cdp=await ctx.newCDPSession(p); await cdp.send('Performance.enable');
 await p.goto(U); await p.waitForFunction(()=>window.OSGame&&OSGame.debug().mode==='title');
 const m=async()=>{const r=(await cdp.send('Performance.getMetrics')).metrics;const o={};r.forEach(x=>o[x.name]=x.value);return o;};
 const meas=async(label)=>{ const fr=await p.evaluate(()=>new Promise(res=>{let n=0,t0=performance.now();function f(){n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else res(n/3);} requestAnimationFrame(f);})); const a=await m(); await p.waitForTimeout(5000); const z=await m(); console.log(w+'x'+h+'@'+dpr,label,'fps',fr.toFixed(0),'main-thread busy',((z.TaskDuration-a.TaskDuration)/5*100).toFixed(0)+'%', 'script', ((z.ScriptDuration-a.ScriptDuration)/5*100).toFixed(0)+'%');};
 await meas('title');
 await p.click('#btn-play',{force:true}); await p.waitForTimeout(800);
 await meas('play-idle');
 await p.evaluate(()=>{window.bridge&&0;}); 
 await ctx.close();}
 await b.close();
})();

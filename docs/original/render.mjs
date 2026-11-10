// uso: FPS=120 node render.mjs <inicio> <fim> <pasta> [porta]   |   FPS=100 node render.mjs 10,250,900 x <pasta> [porta]
import { chromium } from 'playwright-core'; import fs from 'fs';
const [,,a,b,dir,port='8780']=process.argv;const FPS=+(process.env.FPS||60);
const exe=fs.readdirSync('/opt/pw-browsers').filter(d=>d.startsWith('chromium-')).map(d=>`/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
const br=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
const pg=await br.newPage({viewport:{width:1080,height:1920}});pg.on('pageerror',e=>console.log('PAGEERR',e.message));
await pg.goto(`http://localhost:${port}/index.html`);await pg.waitForFunction('window.__ready===true',null,{timeout:60000});
fs.mkdirSync(dir,{recursive:true});const list=a.includes(',')?a.split(',').map(Number):null;const t0=Date.now();
const shot=async f=>{await pg.evaluate(t=>window.renderFrame(t),f/FPS);await pg.screenshot({path:`${dir}/f${String(f).padStart(5,'0')}.png`})};
if(list){for(const f of list)await shot(f)}else{for(let f=+a;f<+b;f++){await shot(f);if(f%300===0)console.log('frame',f,((Date.now()-t0)/1000|0)+'s')}}
await br.close();

const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../KTB_AUCTION_V1.html')).href);
 const results=[];
 for(const width of [1920,1440,1024,768,390,320,1440]){
  await page.setViewportSize({width,height:900});
  for(const tab of ['auc','res','dmd','plan','sd','pd']){
   await page.locator(`.tab[data-scr="${tab}"]`).click();
   await page.waitForTimeout(350);
   const result=await page.evaluate(()=>{
    const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && !e.matches('#uiControls legend');
    const clipped=[...document.querySelectorAll('.screen.on *,#tabbar *')].filter(visible).filter(e=>{
     const s=getComputedStyle(e);return (['hidden','clip'].includes(s.overflowX)&&e.scrollWidth>e.clientWidth+2)||(['hidden','clip'].includes(s.overflowY)&&e.scrollHeight>e.clientHeight+2);
    }).map(e=>({id:e.id,cls:e.className,tag:e.tagName,w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight}));
    const scrollChecks=[...document.querySelectorAll('.screen.on .p-body')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>{
     e.scrollLeft=e.scrollWidth;const reached=e.scrollLeft>=e.scrollWidth-e.clientWidth-2;
     const row=e.querySelector('tbody tr');const cells=row?[...row.querySelectorAll('td.stick')]:[];
     const overlap=cells.some((c,i)=>i&&c.getBoundingClientRect().left<cells[i-1].getBoundingClientRect().right-2);
     e.scrollLeft=0;return {reached,overlap};
    });
    return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,clipped,scrollChecks,charts:[...document.querySelectorAll('.screen.on canvas')].map(e=>({id:e.id,w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)}))};
   });
   results.push({width,tab,...result});
   if(process.env.KTB_SCREENSHOTS && [1440,390].includes(width))await page.screenshot({path:path.join(process.env.KTB_SCREENSHOTS,`${tab}-${width}.png`),fullPage:true});
  }
 }
 console.log(JSON.stringify({errors,results},null,2));
 await browser.close();
 if(errors.length||results.some(r=>r.pageWidth>r.viewport+1||r.clipped.length||r.scrollChecks.some(s=>!s.reached||s.overlap)||r.charts.some(c=>['spk2','spk3'].includes(c.id)&&c.h!==96)))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

// Set NODE_PATH to the bundled node_modules when Playwright is not installed locally.
const {chromium} = require('playwright');
const {pathToFileURL} = require('url');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../KTB_AUCTION_V2.html')).href);
  assert.equal(await page.evaluate(() => V2.planDisclosures.length), 10);
  assert.equal(await page.evaluate(() => V2.results.filter(r => r.t === 'comp' && r.src === 'MOFE').length), 79);
  assert((await page.evaluate(() => V2.results.filter(r => r.synthetic).length)) > 0);
  assert.equal(await page.evaluate(() => V2.ecosMarket.rate), 4.491);
  assert((await page.evaluate(() => V2.ncbTypes.reduce((sum, row) => sum + row.amt, 0))) > 0);
  assert((await page.locator('#v2-source-banner').innerText()).includes('모형값'));
  const consistency = await page.evaluate(() => ({
    annual:V2.planYoy.every(row=>Math.abs(row.cy-V2.monthlyPlan[row.mat].cy.reduce((a,b)=>a+b,0))<0.01),
    net:V2.sdSeries.issue.every((value,i)=>Number.isFinite(value-V2.sdSeries.redeem[i]-V2.sdSeries.buyback[i]+V2.sdSeries.exchange[i])),
    ncb:V2.ncbRows.every(row=>row.won>=0 && row.ncomp>=0),
    spread:V2.results.filter(row=>row.t==='comp').every(row=>row.spr>=-1.8 && row.spr<=2.2)
  }));
  assert.deepEqual(consistency,{annual:true,net:true,ncb:true,spread:true});
  for (const tab of ['res','dmd','plan','sd','pd','auc']) {
    await page.locator(`#tabbar [data-scr="${tab}"]`).click();
    const text = await page.locator(`#scr-${tab}`).innerText();
    assert(text.length > 50, `${tab} is empty`);
    assert(!text.includes('NaN'), `${tab} contains NaN`);
    if (tab === 'sd') assert((await page.locator('#sdWFDetail').innerText()).includes('순공급 Net Supply'));
    if (tab === 'auc') assert((await page.locator('#blotBody').innerText()).includes('비경쟁'));
  }
  assert.deepEqual(errors, []);
  console.log('V2 browser check passed: 6 tabs, 79 official results, 10 plans, synthetic consistency, no JavaScript errors');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1});

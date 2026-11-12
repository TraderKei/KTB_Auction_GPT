// Set NODE_PATH to the bundled node_modules when Playwright is not installed locally.
const {chromium} = require('playwright');
const {pathToFileURL} = require('url');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../KTB_AUCTION_V2.html')).href);
  assert.equal(await page.evaluate(() => V2.plan.length), 10);
  assert.equal(await page.evaluate(() => V2.results.filter(r => r.t === 'comp' && !r.planned).length), 79);
  assert.equal(await page.evaluate(() => V2.ecosMarket.rate), 4.491);
  assert((await page.evaluate(() => V2.ncbTypes.reduce((sum, row) => sum + row.amt, 0))) > 0);
  assert((await page.locator('#v2-source-banner').innerText()).includes('더미'));
  for (const tab of ['res','dmd','plan','sd','pd','auc']) {
    await page.locator(`#tabbar [data-scr="${tab}"]`).click();
    const text = await page.locator(`#scr-${tab}`).innerText();
    assert(text.length > 50, `${tab} is empty`);
    assert(!text.includes('NaN'), `${tab} contains NaN`);
    if (tab === 'sd') assert(text.includes('순공급 미산출'));
    if (tab === 'auc') assert((await page.locator('#blotBody').innerText()).includes('비경쟁'));
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('V2 browser check passed: 6 tabs, 79 results, 10 plans, no JavaScript errors');
})().catch(error => {console.error(error); process.exitCode = 1});

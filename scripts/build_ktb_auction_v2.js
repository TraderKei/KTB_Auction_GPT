/** Build V2 from the preserved MOFE disclosures, keeping V1 intact. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'KTB_AUCTION_V1.html'), 'utf8');
const snapshotText = fs.readFileSync(path.join(root, 'mockup/ktb-terminal-v3-data.js'), 'utf8');
const snapshot = JSON.parse(snapshotText.match(/window\.KTB_OFFLINE_DATA\s*=\s*(\{[\s\S]*\});/)[1]);
const samplePriorYear = Function(`return (${source.match(/const PLAN_MONTHLY = (\{[\s\S]*?\n\});/)[1]})`)();
const ecosMarket = JSON.parse(fs.readFileSync(path.join(root, 'discovery/raw/ecos/search-market-30y-20261007.json'), 'utf8')).StatisticSearch.row[0];
const num = value => value == null || value === '' ? null : Number(value);
const dateInPeriod = period => {
  const match = String(period || '').match(/(20\d{2})\.(\d{1,2})\.(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
};
const planRows = snapshot.plans.flatMap(plan => plan.rows.map((row, index) => ({...row, month:plan.month, source_ref:plan.source_ref, index})));
const normalizedName = name => String(name || '').replace(/\([^)]*\)$/, '').trim();
const key = row => `${row.auction_date}|${row.maturity_code}|${normalizedName(row.source_name)}`;
const plannedByKey = new Map(planRows.map(row => [key(row), row]));
const resultKeys = new Set(snapshot.results.map(key));
const results = snapshot.results.map((row, index) => {
  const plan = plannedByKey.get(key(row));
  return {d:row.auction_date, code:row.source_ref, nm:row.source_name, mat:row.maturity_code,
    seq:plan?.tranche || '—', t:'comp', plan:num(row.plan_amt) ?? plan?.plan_amt ?? null,
    bid:num(row.bid_amt), won:num(row.won_amt), hi:num(row.high_rate),
    wavg:num(row.wavg_rate), lo:num(row.low_rate), par:num(row.partial_alloc_rate),
    published:num(row.published_rate), spr:+(Math.sin(index * 1.7) * 1.4).toFixed(1), nc:null, pd:null, pay:plan?.pay_date || null,
    src:'MOFE', source_ref:row.source_ref};
});
for (const row of planRows) {
  if (resultKeys.has(key(row))) continue;
  results.push({d:row.auction_date, code:`${row.source_ref}:${row.index}`, nm:row.source_name,
    mat:row.maturity_code, seq:row.tranche || '—', t:'comp', plan:row.plan_amt,
    bid:null, won:null, hi:null, wavg:null, lo:null, par:null, spr:null, nc:null,
    pd:null, pay:row.pay_date, planned:true, src:'MOFE', source_ref:row.source_ref});
}
const noncomp = snapshot.noncomp.flatMap(disclosure => disclosure.parts.map((part, index) => ({
  d:dateInPeriod(part.exercise_period) || disclosure.month, code:`${disclosure.source_ref}:${index}`,
  nm:part.source_name, mat:'—', seq:'—', t:part.auction_type,
  plan:null, bid:null, won:part.amount, hi:null, wavg:null, lo:null, par:null,
  spr:null, nc:part.amount, pd:part.institution_count, pay:null,
  src:'MOFE', source_ref:disclosure.source_ref, exercise_period:part.exercise_period
})));
const events = snapshot.events.map(row => ({
  d:row.event_date, code:row.event_key, nm:row.target_desc, mat:'—', seq:'—',
  t:row.event_type.toLowerCase(), plan:null, bid:null, won:row.amount,
  hi:null, wavg:null, lo:null, par:null, spr:null, nc:null, pd:null, pay:null,
  src:'MOFE', source_ref:row.event_key
}));
const allResults = [...results, ...noncomp, ...events].sort((a,b) => a.d.localeCompare(b.d) || a.code.localeCompare(b.code));
const months = snapshot.plans.map(p => p.month.slice(0,7));
const monthLabel = month => month.slice(2,4) + '-' + month.slice(5,7);
const sum = rows => rows.reduce((total, row) => total + (num(row) || 0), 0);
const monthlyPlan = Object.fromEntries(['2Y','3Y','5Y','10Y','20Y','30Y','50Y','KTBi'].map(mat => [mat, {
  py:samplePriorYear[mat].py, // V1 display-only values; no 2025 MOFE source is preserved here.
  cy:Array.from({length:12}, (_,i) => i < snapshot.plans.length ? sum(snapshot.plans[i].rows.filter(r => r.maturity_code === mat).map(r => r.plan_amt))/10000 : null)
}]));
const maturityByName = new Map(results.filter(r=>r.t==='comp' && !r.planned).map(r=>[normalizedName(r.nm),r.mat]));
const ncbRows = noncomp.map(row => ({nm:row.nm, mat:maturityByName.get(normalizedName(row.nm)) || '—', tr:row.exercise_period,
  won:null, ncomp:row.nc, pdc:row.pd, src:'MOFE'}));
const latestMonth = months.at(-1);
const latestNoncompMonth = noncomp.map(row=>row.d.slice(0,7)).sort().at(-1);
const typeLabels = {nc1:'비경쟁 I',nc2:'비경쟁 II',nc3:'비경쟁 III',nc4:'비경쟁 IV'};
const ncbTypes = Object.entries(typeLabels).map(([code,ko]) => ({code,ko,desc:'재정경제부 결과 공시',
  amt:sum(noncomp.filter(row => row.t === code && row.d.startsWith(latestNoncompMonth)).map(row => row.nc))}));
const monthOf = row => row.d.slice(0,7);
const wonByMonth = months.map(m => sum(results.filter(r => !r.planned && monthOf(r) === m).map(r => r.won))/10000);
const noncompByMonth = months.map(m => sum(noncomp.filter(r => monthOf(r) === m).map(r => r.nc))/10000);
const buybackByMonth = months.map(m => sum(events.filter(r => r.t === 'bb' && monthOf(r) === m).map(r => r.won))/10000);
const data = {
  results:allResults, plan:snapshot.plans.map(p => ({month:p.month, total:p.competitive_total_amt, source_ref:p.source_ref})),
  monthlyPlan, ncbRows, ncbTypes,
  ncbSeries:{labels:months.map(monthLabel), won:wonByMonth, noncomp:noncompByMonth}, latestNoncompMonth,
  sdSeries:{labels:months.map(monthLabel), issue:wonByMonth.map((v,i)=>v+noncompByMonth[i]),
    redeem:Array(months.length).fill(null), buyback:buybackByMonth, exchange:Array(months.length).fill(null)},
  ecosMarket:{date:ecosMarket.TIME, rate:Number(ecosMarket.DATA_VALUE), statCode:ecosMarket.STAT_CODE, itemCode:ecosMarket.ITEM_CODE1}
};
let html = source.replace('KTB TERMINAL v5 —', 'KTB TERMINAL v2 —');
html = html.replace('기준시점 2026-09, 모두 더미데이터.', '재정경제부 보존 공시와 한국은행 ECOS 참고값을 사용하며, 미확보 값은 더미로 표시한다.');
const dataScript = `<script>/* Preserved MOFE disclosure snapshot. Generated by scripts/build_ktb_auction_v2.js. */\nconst V2 = ${JSON.stringify(data).replace(/<\//g,'<\\/')};\n</script>\n`;
html = html.replace('<script src="mockup/vendor/vue.global.prod.3.2.41.js"></script>', dataScript + '<script src="mockup/vendor/vue.global.prod.3.2.41.js"></script>');
function replaceDeclaration(name, replacement) {
  const start = html.indexOf(`const ${name} = `);
  if (start < 0) throw Error(`Missing declaration: ${name}`);
  let pos = start + `const ${name} = `.length;
  let depth = 0, quote = null, escaped = false;
  for (; pos < html.length; pos++) {
    const c = html[pos];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') {quote = c; continue;}
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ';' && depth === 0) break;
  }
  if (pos >= html.length) throw Error(`Unterminated declaration: ${name}`);
  html = html.slice(0,start) + `const ${name} = ${replacement};` + html.slice(pos+1);
}
replaceDeclaration('RESULTS','V2.results');
replaceDeclaration('PLAN_MONTHLY','V2.monthlyPlan');
replaceDeclaration('NCB_ROWS','V2.ncbRows');
replaceDeclaration('NCB_TYPES','V2.ncbTypes');
replaceDeclaration('NCB_SERIES','V2.ncbSeries');
replaceDeclaration('SD_SERIES','V2.sdSeries');
html = html.replace('const PLAN_CUR_MONTH = 8;', 'const PLAN_CUR_MONTH = 9;');
html = html.replace('const TODAY = { y:2026, m:8, d:11 };', 'const TODAY = { y:2026, m:9, d:31 };');
html = html.replace('const DATA_MIN = { y:2026, m:6 };', 'const DATA_MIN = { y:2026, m:0 };');
html = html.replace('activeMats.has(r.mat)).forEach(r=>{', '(r.mat==="—" || activeMats.has(r.mat))).forEach(r=>{');
html = html.replace('2026-09 계획 (경쟁입찰 기준)', '2026-10 재정경제부 경쟁입찰 계획');
html = html.replace('>15.2<small> 조원</small>', '>12.0<small> 조원</small>');
html = html.replace('data-source="BOK_ECOS" data-freq="입찰일 T+0 16:00"', 'data-source="MOEF_KTB" data-freq="입찰결과 공시"');
html = html.replaceAll('data-field="auc.spread_vs_mts" data-source="DERIVED"', 'data-field="auc.spread_vs_mts" data-source="DEMO"');
html = html.replaceAll('data-field="dmd.score" data-source="DERIVED"', 'data-field="dmd.score" data-source="DEMO"');
html = html.replaceAll('data-field="plan.group_mix" data-source="MOEF_KTB"', 'data-field="plan.group_mix" data-source="DEMO"');
html = html.replaceAll('data-field="plan.group_issue" data-source="MOEF_KTB"', 'data-field="plan.group_issue" data-source="DEMO"');
html = html.replaceAll('data-field="auc.wavg_rate" data-source="BOK_ECOS"', 'data-field="auc.wavg_rate" data-source="MOEF_KTB"');
html = html.replaceAll('data-field="auc.high_rate" data-source="BOK_ECOS"', 'data-field="auc.high_rate" data-source="MOEF_KTB"');
html = html.replace('<th class="l stick stick-2">종목코드</th>', '<th class="l stick stick-2">공시 ID</th>');
html = html.replace('data-field="bond.isin" data-source="MOEF_KTB"', 'data-field="auc.source_ref" data-source="MOEF_KTB"');
html = html.replace('${r.bid?fmt(r.bid):"—"}', '${r.bid!=null?fmt(r.bid):"—"}');
html = html.replace('${r.won?fmt(r.won):"—"}', '${r.won!=null?fmt(r.won):"—"}');
html = html.replace('${r.nc?fmt(r.nc):"—"}', '${r.nc!=null?fmt(r.nc):"—"}');
html = html.replace('>${r.pay}</td>`;', '>${r.pay || "—"}</td>`;');
html = html.replace('>${r.pdc}</td>', '>${fmt(r.pdc)}</td>');
html = html.replace('기준시점 2026-09 · 모든 수치는 현실적 더미데이터', '재정경제부 원문 스냅샷(2026년 1~10월)과 화면 예시용 더미데이터 혼합');
html = html.replace(/kpiSpark\("spk1",\[12\.8[^;]*;/,
  'kpiSpark("spk1",V2.plan.map(p=>p.total/10000),"#3899fa");');
html = html.replace('RESULTS.find(r=>r.code==="KR103501GD68" && !r.planned && r.hi!=null && r.d.startsWith(initYmPrefix))', 'RESULTS.find(r=>r.t==="comp" && !r.planned && r.hi!=null && r.d.startsWith(initYmPrefix))');
html = html.replace('RESULTS.find(r=>r.code==="KR103501GD68" && !r.planned && r.hi!=null)', 'RESULTS.find(r=>r.t==="comp" && !r.planned && r.hi!=null)');
html = html.replace('RESULTS.find(r=>r.code==="KR103501GD68")', 'RESULTS.find(r=>r.t==="comp")');
const banner = `<div id="v2-source-banner" style="padding:7px 14px;background:#123755;color:#fff;font-size:12px;line-height:1.5">v2 데이터 기준 · <strong>재정경제부 공시</strong>: 2026년 1~10월 발행계획, 입찰결과는 10월 8일까지 일부 보존, 비경쟁인수는 9월까지 보존. 매입·교환은 보존 공시 기준이며 월별 합계는 관측분입니다. <strong>한국은행 ECOS</strong>: 2026-10-07 국고채 30년 유통금리 4.491% (참고 지표, 낙찰금리 아님). <strong>더미</strong>: 2025년 비교값, 연간 목표·만기 구조, 수요점수·민평대비. <strong>미산출</strong>: 상환·순공급. 스냅샷 이후 공시는 아직 반영되지 않았습니다. <a href="https://mofe.go.kr/st/fnancstats/ktb50201.do" style="color:#aee2ff">공식 입찰결과</a> · <a href="https://ecos.bok.or.kr/api/" style="color:#aee2ff">ECOS</a></div>`;
html = html.replace('<section class="screen on" id="scr-auc">', banner + '\n<section class="screen on" id="scr-auc">');
html = html.replace('</style>', '[data-source="DEMO"]::after{content:" *";color:var(--warn);font-size:.8em}\n</style>');
html = html.replace('KTB TERMINAL Mock-up · 화면 설계 전용', 'KTB TERMINAL v2 · 공식 공시 스냅샷 + 표시용 더미');
html = html.replace('<span class="badge plan">예정</span>', '<span class="badge plan">계획/결과 미수집</span>');
html = html.replace('>경쟁·비경쟁 인수액 & 비중 (조원)<', '>경쟁·비경쟁 관측액 & 비중 (조원)<');
html = html.replace('>비경쟁 유형별 인수 구성<', `>비경쟁 유형별 인수 구성 (${latestNoncompMonth} 관측)<`);
html = html.replace('const net = labels.map((_,i)=>+(issue[i]-redeem[i]-buyback[i]+exchange[i]).toFixed(1));',
  'const net = labels.map((_,i)=>redeem[i]==null || exchange[i]==null ? null : +(issue[i]-redeem[i]-buyback[i]+exchange[i]).toFixed(1));');
html = html.replace('data:redeem.map(v=>-v)', 'data:redeem.map(v=>v==null?null:-v)');
html = html.replace(/  const net = \+\(issue - redeem - buyback \+ exchange\)\.toFixed\(1\);\r?\n  const items = \[/,
  '  if(redeem==null || exchange==null){\n    const title=document.getElementById("sdWFTitle");\n    if(title) title.textContent=`20${lbl.slice(0,2)}-${lbl.slice(3)} 수급 (순공급 미산출)`;\n    const canvas=document.getElementById("sdWF");\n    if(canvas){const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=uiColor("--tx-mut");ctx.font="12px Noto Sans KR Web";ctx.fillText("상환원금·교환 순증감 미확보 — 순공급 미산출",12,canvas.height/2);}\n    document.getElementById("sdWFDetail").innerHTML=`<div class="row"><span class="k">경쟁·비경쟁 발행 관측액</span><span class="v">${issue.toFixed(1)}조</span></div><div class="row"><span class="k">매입 관측액</span><span class="v">${buyback.toFixed(1)}조</span></div><div class="row"><span class="k">만기상환·교환 순증감·순공급</span><span class="v">미확보</span></div>`;\n    return;\n  }\n  const net = +(issue - redeem - buyback + exchange).toFixed(1);\n  const items = [');
html = html.replace('const totRatio = totNcomp/(totWon+totNcomp)*100;', 'const totRatio = totWon ? totNcomp/(totWon+totNcomp)*100 : null;');
html = html.replace('const ratio=r.ncomp/(r.won+r.ncomp)*100; const cw=r.won/(r.won+r.ncomp)*100;',
  'const ratio=r.won==null?null:r.ncomp/(r.won+r.ncomp)*100; const cw=ratio==null?null:100-ratio;');
html = html.replace('${ratio.toFixed(1)}%', '${ratio==null?"—":ratio.toFixed(1)+"%"}');
html = html.replace('<div class="stack" style="width:120px"><i style="width:${cw}%;background:var(--accent)" title="경쟁 ${cw.toFixed(0)}%"></i><i style="width:${ratio}%;background:#ffd179" title="비경쟁 ${ratio.toFixed(0)}%"></i></div>',
  '${ratio==null?"경쟁입찰 연결 없음":`<div class="stack" style="width:120px"><i style="width:${cw}%;background:var(--accent)"></i><i style="width:${ratio}%;background:#ffd179"></i></div>`}');
html = html.replace('${totRatio.toFixed(1)}%', '${totRatio==null?"—":totRatio.toFixed(1)+"%"}');
html = html.replace('<h3>발행계획 증감분석</h3>', '<h3>발행계획 증감분석 (2025 비교·연간값 더미)</h3>');
html = html.replaceAll('data-field="plan.annual_total" data-source="MOEF_KTB"', 'data-field="plan.annual_total" data-source="DEMO"');
html = html.replaceAll('data-field="plan.annual_yoy" data-source="DERIVED"', 'data-field="plan.annual_yoy" data-source="DEMO"');
html = html.replaceAll('data-field="plan.month_yoy" data-source="DERIVED"', 'data-field="plan.month_yoy" data-source="DEMO"');
html = html.replaceAll('data-field="plan.ytd_yoy" data-source="DERIVED"', 'data-field="plan.ytd_yoy" data-source="DEMO"');
fs.writeFileSync(path.join(root, 'KTB_AUCTION_V2.html'), html);
console.log(`Wrote KTB_AUCTION_V2.html (${allResults.length} disclosure/plan rows; ${snapshot.plans.length} months)`);

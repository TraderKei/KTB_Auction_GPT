/** Build V2 from the preserved MOFE disclosures, keeping V1 intact. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'KTB_AUCTION_V1.html'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data/ktb-v2-source.json'), 'utf8'));
const ecosMarket = snapshot.ecosMarket;
const num = value => value == null || value === '' ? null : Number(value);
const sum = rows => rows.reduce((total, row) => total + (num(row) || 0), 0);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const round = (value, digits=0) => +value.toFixed(digits);
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
};
const nextBusinessDay = iso => {
  const day = new Date(`${iso}T00:00:00Z`);
  do day.setUTCDate(day.getUTCDate()+1);
  while ([0,6].includes(day.getUTCDay()));
  return day.toISOString().slice(0,10);
};
const observed = snapshot.results.filter(row => row.auction_type === 'comp');
const benchmark = (mat, date) => {
  const rows = observed.filter(row => row.maturity_code === mat);
  const rates = rows.map(row => ({date:row.auction_date, value:num(row.wavg_rate) ?? num(row.published_rate)})).filter(row => row.value != null);
  rates.sort((a,b)=>Math.abs(Date.parse(a.date)-Date.parse(date))-Math.abs(Date.parse(b.date)-Date.parse(date)));
  const base = rates[0]?.value ?? median(observed.map(row => num(row.wavg_rate))) ?? 3.5;
  const btc = median(rows.filter(row => num(row.bid_amt)!=null && num(row.plan_amt)>0).map(row => num(row.bid_amt)/num(row.plan_amt))) ?? 2.5;
  return {rate:base, btc:clamp(btc,1.5,4.0)};
};
const modeledSpread = (btc, tailBp, index) => round(clamp(0.6 - 0.7*(btc-2.5) + 0.15*tailBp + 0.12*Math.sin(index*1.7), -1.8, 2.2),1);
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
  const scheduled = num(row.plan_amt) ?? plan?.plan_amt ?? null;
  const ref = benchmark(row.maturity_code, row.auction_date);
  const demoFields = [];
  const chosen = (field, value, synthetic) => {
    if (value != null) return value;
    demoFields.push(field);
    return synthetic;
  };
  const bid = chosen('bid', num(row.bid_amt), scheduled == null ? null : Math.round(scheduled*ref.btc/10)*10);
  const won = chosen('won', num(row.won_amt), scheduled);
  const baseRate = num(row.wavg_rate) ?? num(row.published_rate) ?? ref.rate;
  const wavg = chosen('wavg', num(row.wavg_rate), round(baseRate,3));
  const hi = chosen('hi', num(row.high_rate), round(wavg+0.009,3));
  const lo = chosen('lo', num(row.low_rate), round(Math.min(wavg,hi)-0.012,3));
  const par = chosen('par', num(row.partial_alloc_rate), round(clamp(50+18*Math.sin(index*0.9),15,90),1));
  const btc = bid && scheduled ? bid/scheduled : ref.btc;
  const spr = modeledSpread(btc,(hi-wavg)*100,index);
  demoFields.push('spr');
  return {d:row.auction_date, code:row.source_ref, nm:row.source_name, mat:row.maturity_code,
    seq:plan?.tranche || '—', t:'comp', plan:scheduled,
    bid, won, hi, wavg, lo, par,
    published:num(row.published_rate), spr, nc:null, pd:null, pay:plan?.pay_date || nextBusinessDay(row.auction_date),
    src:'MOFE', source_ref:row.source_ref, demoFields};
});
for (const row of planRows) {
  if (resultKeys.has(key(row))) continue;
  const ref = benchmark(row.maturity_code,row.auction_date);
  const index = results.length;
  const wavg = round(ref.rate + 0.015*Math.sin(index*0.8),3);
  const hi = round(wavg+0.009,3);
  const bid = Math.round(row.plan_amt*ref.btc/10)*10;
  results.push({d:row.auction_date, code:`${row.source_ref}:${row.index}`, nm:row.source_name,
    mat:row.maturity_code, seq:row.tranche || '—', t:'comp', plan:row.plan_amt,
    bid, won:row.plan_amt, hi, wavg, lo:round(wavg-0.012,3),
    par:round(clamp(50+18*Math.sin(index*0.9),15,90),1),
    spr:modeledSpread(bid/row.plan_amt,(hi-wavg)*100,index), nc:null,
    pd:null, pay:row.pay_date, synthetic:true, src:'DEMO', source_ref:row.source_ref,
    demoFields:['bid','won','hi','wavg','lo','par','spr']});
}
const noncomp = snapshot.noncomp.flatMap(disclosure => disclosure.parts.map((part, index) => ({
  d:dateInPeriod(part.exercise_period) || disclosure.month, code:`${disclosure.source_ref}:${index}`,
  nm:part.source_name, mat:'—', seq:'—', t:part.auction_type,
  plan:null, bid:null, won:part.amount, hi:null, wavg:null, lo:null, par:null,
  spr:null, nc:part.amount,
  pd:part.institution_count ?? (part.amount>0 ? Math.round(clamp(part.amount/400,2,20)) : 0), pay:null,
  src:'MOFE', source_ref:disclosure.source_ref, exercise_period:part.exercise_period,
  demoFields:part.institution_count==null && part.amount>0 ? ['pd'] : []
})));
const maturityByName = new Map(results.filter(r=>r.t==='comp' && !r.synthetic).map(r=>[normalizedName(r.nm),r.mat]));
for (const row of noncomp) row.mat = maturityByName.get(normalizedName(row.nm)) || '—';
for (const row of results) {
  const matches = noncomp.filter(nc=>nc.d.slice(0,7)===row.d.slice(0,7) && normalizedName(nc.nm)===normalizedName(row.nm));
  if (matches.length) row.nc = sum(matches.map(nc=>nc.nc));
  else {
    row.nc = Math.round(row.won*0.075/10)*10;
    row.demoFields.push('nc');
  }
}
const events = snapshot.events.map(row => ({
  d:row.event_date, code:row.event_key, nm:row.target_desc, mat:'—', seq:'—',
  t:row.event_type.toLowerCase(), plan:null, bid:null, won:row.amount,
  hi:null, wavg:null, lo:null, par:null, spr:null, nc:null, pd:null, pay:null,
  src:'MOFE', source_ref:row.event_key
}));
const allResults = [...results, ...noncomp, ...events].sort((a,b) => a.d.localeCompare(b.d) || a.code.localeCompare(b.code));
const months = snapshot.plans.map(p => p.month.slice(0,7));
const monthLabel = month => month.slice(2,4) + '-' + month.slice(5,7);
const mats = ['2Y','3Y','5Y','10Y','20Y','30Y','50Y','KTBi'];
const monthlyPlan = Object.fromEntries(mats.map((mat,matIndex) => {
  const observed = snapshot.plans.map(plan=>round(sum(plan.rows.filter(row=>row.maturity_code===mat).map(row=>row.plan_amt))/10000,3));
  const recent = median(observed.slice(-4).filter(value=>value>0)) ?? median(observed.filter(value=>value>0)) ?? 0.1;
  const cy = [...observed, round(recent*0.90,3), round(recent*0.70,3)];
  const py = cy.map((value,i)=>round(value*(0.96+0.045*Math.sin(matIndex*1.4+i*0.7)),3));
  return [mat,{py,cy}];
}));
const planYoy = mats.map(mat=>({mat,py:round(sum(monthlyPlan[mat].py),2),cy:round(sum(monthlyPlan[mat].cy),2)}));
const plan = planYoy.map(row=>({mat:row.mat,plan:row.cy,
  act:round(sum(results.filter(result=>result.mat===row.mat && result.t==='comp').map(result=>result.won))/10000,2)}));
const groups = {단기:['2Y','3Y'],중기:['5Y','10Y'],장기:['20Y','30Y','50Y']};
const groupYear = (year, factor=1) => {
  const amt = Object.fromEntries(Object.entries(groups).map(([group,groupMats])=>[group,
    round(sum(groupMats.map(mat=>sum(monthlyPlan[mat][year])))*factor,1)]));
  const total = round(sum(Object.values(amt)),1);
  const mix = Object.fromEntries(Object.entries(amt).map(([group,value])=>[group,round(value/total*100,1)]));
  const net = Object.fromEntries(Object.entries(amt).map(([group,value])=>[group,round(value*0.55,1)]));
  return {mix,amt,net,total,planned:year==='cy',tol:5};
};
const planYearData = {2024:groupYear('py',0.97),2025:groupYear('py'),2026:groupYear('cy')};
const ncbGroups = new Map();
for (const row of noncomp) {
  const groupKey = `${row.d.slice(0,7)}|${normalizedName(row.nm)}`;
  if (!ncbGroups.has(groupKey)) ncbGroups.set(groupKey,[]);
  ncbGroups.get(groupKey).push(row);
}
const ncbRows = noncomp.map(row => {
  const group = ncbGroups.get(`${row.d.slice(0,7)}|${normalizedName(row.nm)}`);
  const related = results.filter(result=>result.d.slice(0,7)===row.d.slice(0,7) && normalizedName(result.nm)===normalizedName(row.nm));
  const actualWon = sum(related.map(result=>result.won));
  const groupNc = sum(group.map(item=>item.nc));
  const fallbackWon = Math.round(Math.max(groupNc*6,3000)/10)*10;
  const groupWon = actualWon || fallbackWon;
  const won = groupNc>0 ? Math.round(groupWon*(row.nc/groupNc)) : Math.round(groupWon/group.length);
  return {nm:row.nm, mat:row.mat, tr:row.exercise_period, won,
    ncomp:row.nc, pdc:row.pd, src:'MOFE', syntheticWon:!actualWon || related.some(result=>result.synthetic),
    syntheticPd:row.demoFields.includes('pd')};
});
const latestMonth = months.at(-1);
const latestNoncompMonth = noncomp.map(row=>row.d.slice(0,7)).sort().at(-1);
const typeLabels = {nc1:'비경쟁 I',nc2:'비경쟁 II',nc3:'비경쟁 III',nc4:'비경쟁 IV'};
const ncbTypes = Object.entries(typeLabels).map(([code,ko]) => ({code,ko,desc:'재정경제부 결과 공시',
  amt:sum(noncomp.filter(row => row.t === code && row.d.startsWith(latestNoncompMonth)).map(row => row.nc))}));
const monthOf = row => row.d.slice(0,7);
const noncompByMonth = months.map(m => sum(noncomp.filter(r => monthOf(r) === m).map(r => r.nc))/10000);
const buybackByMonth = months.map(m => sum(events.filter(r => r.t === 'bb' && monthOf(r) === m).map(r => r.won))/10000);
const competitiveEstimate = snapshot.plans.map((plan,i)=>round(plan.competitive_total_amt/10000*(0.99+0.01*Math.sin(i)),3));
const noncompEstimate = noncompByMonth.map((value,i)=>value>0?value:round(competitiveEstimate[i]*0.07,3));
const issueEstimate = competitiveEstimate.map((value,i)=>round(value+noncompEstimate[i],3));
const buybackEstimate = buybackByMonth.map((value,i)=>value>0?value:round(issueEstimate[i]*0.045,3));
const redeemEstimate = issueEstimate.map((value,i)=>round(value*(0.42+0.035*Math.sin(i*0.8)),3));
const exchangeEstimate = issueEstimate.map((value,i)=>round(value*0.01*Math.sin(i*1.3),3));
const matMonthlyTrend = Object.fromEntries(mats.map((mat,matIndex) => {
  const btc = [], tail = [], spr = [], score = [];
  for (let i=0;i<months.length;i++) {
    const rows = results.filter(row=>row.mat===mat && monthOf(row)===months[i] && row.t==='comp');
    const avg = (values,fallback) => values.length ? round(sum(values)/values.length,2) : fallback;
    const ref = benchmark(mat,`${months[i]}-15`);
    const b = avg(rows.map(row=>row.bid/row.plan),round(ref.btc,2));
    const t = avg(rows.map(row=>(row.hi-row.wavg)*100),round(clamp(0.7+0.16*matIndex+0.12*Math.sin(i),0.5,2.2),2));
    const s = avg(rows.map(row=>row.spr),modeledSpread(b,t,i+matIndex));
    btc.push(b); tail.push(t); spr.push(s);
    score.push(Math.round(clamp(55+11*(b-2.5)-6*t-4*s,20,85)));
  }
  return [mat,{btc,tail,spr,score}];
}));
const heatLabels = months.slice(-8).map(monthLabel);
const heat = Object.fromEntries(['score','btc','tail','spr'].map(metric=>[metric,
  Object.fromEntries(mats.map(mat=>[mat,matMonthlyTrend[mat][metric].slice(-8)]))]));
const data = {
  results:allResults, planDisclosures:snapshot.plans.map(p => ({month:p.month, total:p.competitive_total_amt, source_ref:p.source_ref})),
  monthlyPlan, planYoy, planYearData, plan, ncbRows, ncbTypes,
  ncbSeries:{labels:months.map(monthLabel), won:competitiveEstimate, noncomp:noncompEstimate}, latestNoncompMonth,
  sdSeries:{labels:months.map(monthLabel), issue:issueEstimate,
    redeem:redeemEstimate, buyback:buybackEstimate, exchange:exchangeEstimate},
  matMonthLabels:months.map(monthLabel), matMonthlyTrend, dmdMonthLabels:months.map(monthLabel),
  dmdMonthlyScore:Object.fromEntries(mats.map(mat=>[mat,matMonthlyTrend[mat].score])), heatLabels, heat,
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
replaceDeclaration('HEAT_LABELS','V2.heatLabels');
replaceDeclaration('HEAT','V2.heat');
replaceDeclaration('PLAN','V2.plan');
replaceDeclaration('PLAN_YOY','V2.planYoy');
replaceDeclaration('PLAN_MONTHLY','V2.monthlyPlan');
replaceDeclaration('PLAN_YEAR_DATA','V2.planYearData');
replaceDeclaration('NCB_ROWS','V2.ncbRows');
replaceDeclaration('NCB_TYPES','V2.ncbTypes');
replaceDeclaration('NCB_SERIES','V2.ncbSeries');
replaceDeclaration('SD_SERIES','V2.sdSeries');
replaceDeclaration('MAT_MONTH_LABELS','V2.matMonthLabels');
replaceDeclaration('MAT_MONTHLY_TREND','V2.matMonthlyTrend');
replaceDeclaration('DMD_MONTH_LABELS','V2.dmdMonthLabels');
replaceDeclaration('DMD_MONTHLY_SCORE','V2.dmdMonthlyScore');
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
html = html.replace('>${r.nm}</td>', '>${r.nm}${r.synthetic?\' <span class="badge est">모형 결과</span>\':\'\'}</td>');
html = html.replace('>${x.nm}</td>', '>${x.nm}${x.synthetic?\' <span class="badge est">모형</span>\':\'\'}</td>');
for (const field of ['bid_amt','won_amt','high_rate','wavg_rate','noncomp_amt']) {
  const property = {bid_amt:'bid',won_amt:'won',high_rate:'hi',wavg_rate:'wavg',noncomp_amt:'nc'}[field];
  html = html.replaceAll(`data-field="auc.${field}" data-source="MOEF_KTB"`,
    `data-field="auc.${field}" data-source="\${r.demoFields?.includes('${property}')?'DEMO':'MOEF_KTB'}"`);
}
html = html.replaceAll('data-field="auc.bid_amt" data-source="BOK_ECOS"',
  'data-field="auc.bid_amt" data-source="${r.demoFields?.includes(\'bid\')?\'DEMO\':\'MOEF_KTB\'}"');
html = html.replaceAll('data-field="ncb.won_amt" data-source="MOEF_KTB"',
  'data-field="ncb.won_amt" data-source="${r.syntheticWon?\'DEMO\':\'MOEF_KTB\'}"');
html = html.replaceAll('data-field="ncb.pd_count" data-source="MOEF_KTB"',
  'data-field="ncb.pd_count" data-source="${r.syntheticPd?\'DEMO\':\'MOEF_KTB\'}"');
html = html.replaceAll('data-field="ncb.noncomp_ratio" data-source="DERIVED"', 'data-field="ncb.noncomp_ratio" data-source="DEMO"');
for (const field of ['issue','redeem','buyback','exchange','net_supply']) {
  html = html.replaceAll(`data-field="sd.${field}" data-source="MOEF_KTB"`, `data-field="sd.${field}" data-source="DEMO"`);
  html = html.replaceAll(`data-field="sd.${field}" data-source="DERIVED"`, `data-field="sd.${field}" data-source="DEMO"`);
}
html = html.replace('${r.bid?fmt(r.bid):"—"}', '${r.bid!=null?fmt(r.bid):"—"}');
html = html.replace('${r.won?fmt(r.won):"—"}', '${r.won!=null?fmt(r.won):"—"}');
html = html.replace('${r.nc?fmt(r.nc):"—"}', '${r.nc!=null?fmt(r.nc):"—"}');
html = html.replace('>${r.pay}</td>`;', '>${r.pay || "—"}</td>`;');
html = html.replace('>${r.pdc}</td>', '>${fmt(r.pdc)}</td>');
html = html.replace('기준시점 2026-09 · 모든 수치는 현실적 더미데이터', '재정경제부 원문 스냅샷(2026년 1~10월)과 화면 예시용 더미데이터 혼합');
html = html.replace(/kpiSpark\("spk1",\[12\.8[^;]*;/,
  'kpiSpark("spk1",V2.planDisclosures.map(p=>p.total/10000),"#3899fa");');
html = html.replace('RESULTS.find(r=>r.code==="KR103501GD68" && !r.planned && r.hi!=null && r.d.startsWith(initYmPrefix))', 'RESULTS.find(r=>r.t==="comp" && !r.planned && r.hi!=null && r.d.startsWith(initYmPrefix))');
html = html.replace('RESULTS.find(r=>r.code==="KR103501GD68" && !r.planned && r.hi!=null)', 'RESULTS.find(r=>r.t==="comp" && !r.planned && r.hi!=null)');
html = html.replace('RESULTS.find(r=>r.code==="KR103501GD68")', 'RESULTS.find(r=>r.t==="comp")');
const banner = `<div id="v2-source-banner" style="padding:7px 14px;background:#123755;color:#fff;font-size:12px;line-height:1.5">v2 데이터 기준 · <strong>재정경제부 원문</strong>: 2026년 1~10월 계획, 일부 입찰결과·비경쟁인수·매입·교환. <strong>한국은행 ECOS</strong>: 2026-10-07 국고채 30년 유통금리 4.491% (참고값). <strong>모형값 *</strong>: 결과가 없는 계획의 응찰·낙찰, 민평대비·수요점수, 2025년 비교·연간 전망, 만기상환·교환 순증감·순공급. 같은 만기 공시값과 월별 계획 규모를 기준으로 생성한 화면 예시이며 실제 거래·공시 수치가 아닙니다. 10월 결과와 9월 이후 비경쟁 결과는 수집이 불완전합니다. <a href="https://mofe.go.kr/st/fnancstats/ktb50201.do" style="color:#aee2ff">공식 입찰결과</a> · <a href="https://ecos.bok.or.kr/api/" style="color:#aee2ff">ECOS</a></div>`;
html = html.replace('<section class="screen on" id="scr-auc">', banner + '\n<section class="screen on" id="scr-auc">');
html = html.replace('</style>', '[data-source="DEMO"]::after{content:" *";color:var(--warn);font-size:.8em}\n</style>');
html = html.replace('KTB TERMINAL Mock-up · 화면 설계 전용', 'KTB TERMINAL v2 · 공식 공시 스냅샷 + 표시용 더미');
html = html.replace('<span class="badge plan">예정</span>', '<span class="badge plan">모형 결과</span>');
html = html.replace('${r.planned?"◇":"◆"}', '${r.synthetic?"◇":"◆"}');
html = html.replace('>경쟁·비경쟁 인수액 & 비중 (조원)<', '>경쟁·비경쟁 공시+모형 (조원)<');
html = html.replace('>비경쟁 유형별 인수 구성<', `>비경쟁 유형별 인수 구성 (${latestNoncompMonth} 관측)<`);
html = html.replace('const net = labels.map((_,i)=>+(issue[i]-redeem[i]-buyback[i]+exchange[i]).toFixed(1));',
  'const net = labels.map((_,i)=>redeem[i]==null || exchange[i]==null ? null : +(issue[i]-redeem[i]-buyback[i]+exchange[i]).toFixed(1));');
html = html.replace('data:redeem.map(v=>-v)', 'data:redeem.map(v=>v==null?null:-v)');
html = html.replace(/  const net = \+\(issue - redeem - buyback \+ exchange\)\.toFixed\(1\);\r?\n  const items = \[/,
  '  if(redeem==null || exchange==null){\n    const title=document.getElementById("sdWFTitle");\n    if(title) title.textContent=`20${lbl.slice(0,2)}-${lbl.slice(3)} 수급 (순공급 미산출)`;\n    const canvas=document.getElementById("sdWF");\n    if(canvas){const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=uiColor("--tx-mut");ctx.font="12px Noto Sans KR Web";ctx.fillText("상환원금·교환 순증감 미확보 — 순공급 미산출",12,canvas.height/2);}\n    document.getElementById("sdWFDetail").innerHTML=`<div class="row"><span class="k">경쟁·비경쟁 발행 관측액</span><span class="v">${issue.toFixed(1)}조</span></div><div class="row"><span class="k">매입 관측액</span><span class="v">${buyback.toFixed(1)}조</span></div><div class="row"><span class="k">만기상환·교환 순증감·순공급</span><span class="v">미확보</span></div>`;\n    return;\n  }\n  const net = +(issue - redeem - buyback + exchange).toFixed(1);\n  const items = [');
html = html.replace('const totRatio = totNcomp/(totWon+totNcomp)*100;', 'const totRatio = totWon ? totNcomp/(totWon+totNcomp)*100 : null;');
html = html.replace('const ratio=r.ncomp/(r.won+r.ncomp)*100; const cw=r.won/(r.won+r.ncomp)*100;',
  'const ratio=r.won==null?null:r.ncomp/(r.won+r.ncomp)*100; const cw=ratio==null?null:100-ratio;');
html = html.replace('const ratio=r.won==null?null:r.ncomp/(r.won+r.ncomp)*100;',
  'const ratio=r.won+r.ncomp>0?r.ncomp/(r.won+r.ncomp)*100:0;');
html = html.replace('${ratio.toFixed(1)}%', '${ratio==null?"—":ratio.toFixed(1)+"%"}');
html = html.replace('<div class="stack" style="width:120px"><i style="width:${cw}%;background:var(--accent)" title="경쟁 ${cw.toFixed(0)}%"></i><i style="width:${ratio}%;background:#ffd179" title="비경쟁 ${ratio.toFixed(0)}%"></i></div>',
  '${ratio==null?"경쟁입찰 연결 없음":`<div class="stack" style="width:120px"><i style="width:${cw}%;background:var(--accent)"></i><i style="width:${ratio}%;background:#ffd179"></i></div>`}');
html = html.replace('${totRatio.toFixed(1)}%', '${totRatio==null?"—":totRatio.toFixed(1)+"%"}');
html = html.replace('<h3>발행계획 증감분석</h3>', '<h3>발행계획 증감분석 (2025 비교·연간값 더미)</h3>');
html = html.replace('그룹 비중 mix · ${py} 확정금액 → ${cy} ${cyEst?"공표비중(%)":"확정"}', '그룹 비중 mix · ${py} 모형금액 → ${cy} 모형비중(%)');
html = html.replace('만기 구조 변화: ${py} 확정 vs ${cy} ${cyEst?"비중계획":"확정"}', '만기 구조 변화: ${py} 모형 vs ${cy} 모형 전망');
html = html.replace('공표비중 × 총한도 ${GM.cyTotal}조 역산', '모형비중 × 전망총액 ${GM.cyTotal}조');
html = html.replace('FY25=그룹별 발행실적 비중 공표(단기 31.6·중기 29.8·장기 38.6%), FY26=만기 그룹 비중계획 공표(만기별 금액 미공표)', '2025년 그룹 비중과 2026년 연간 전망은 월별 계획을 이용한 모형값');
html = html.replace('FY26 그룹 금액·순증은 공표비중×총한도(225.7조) 역산', 'FY26 그룹 금액·순증은 모형으로 계산');
html = html.replace('· 모두 더미데이터', '· 별표는 모형값');
html = html.replace('<div class="mix-yr">${py} <b>확정</b>', '<div class="mix-yr">${py} <b>모형</b>');
html = html.replace('${cyEst?"비중계획":"확정"}', '${cyEst?"모형 전망":"모형"}');
html = html.replace('${cyEst?"공표 %만 (금액 미공표)":"만기별 실적 집계"}', '${cyEst?"월별 계획으로 계산":"모형 값"}');
html = html.replace('원천: MOEF_KTB (2026년 국고채 발행계획 «연물별 배분» / «연간 발행계획 비교»)', '계산 입력: 재정경제부 월별 계획 + 모형 보완');
html = html.replace('원천: MOEF_KTB (ktb.moef.go.kr/isuPlan.do) · 연간계획=전년말 공표 / 월간계획=전월 마지막주 목요일 09:00 공표 · 모두 더미데이터', '계산 입력: 2026년 1~10월 재정경제부 월별 계획, 11~12월 및 2025년 비교값은 모형 생성');
html = html.replace('응찰률·낙찰금리는 한은/기재부 공시 · 같은 만기 지표물 경쟁입찰 월별 추이', '응찰률·낙찰금리는 재정경제부 공시와 모형 보완값 · 같은 만기 경쟁입찰 월별 추이');
html = html.replace('응찰·낙찰액·최고/가중평균/최저 낙찰금리·부분낙찰률은 한은/기재부 결과공시', '응찰·낙찰액·금리·부분낙찰률은 재정경제부 결과공시를 우선하고 빈 값은 모형으로 보완');
html = html.replace('<span class="badge conf">확정</span> 응찰률·낙찰금리는 재정경제부 공시와 모형 보완값', '<span class="badge est">공시+모형</span> 응찰률·낙찰금리는 재정경제부 공시와 모형 보완값');
html = html.replace('<span class="badge conf">확정</span> 응찰·낙찰액·금리·부분낙찰률은 재정경제부 결과공시를 우선하고 빈 값은 모형으로 보완', '<span class="badge est">공시+모형</span> 응찰·낙찰액·금리·부분낙찰률은 재정경제부 결과공시를 우선하고 빈 값은 모형으로 보완');
html = html.replace('"확정 실적"', '"모형 실적"');
html = html.replaceAll('data-field="plan.annual_total" data-source="MOEF_KTB"', 'data-field="plan.annual_total" data-source="DEMO"');
html = html.replaceAll('data-field="plan.annual_yoy" data-source="DERIVED"', 'data-field="plan.annual_yoy" data-source="DEMO"');
html = html.replaceAll('data-field="plan.month_yoy" data-source="DERIVED"', 'data-field="plan.month_yoy" data-source="DEMO"');
html = html.replaceAll('data-field="plan.ytd_yoy" data-source="DERIVED"', 'data-field="plan.ytd_yoy" data-source="DEMO"');
fs.writeFileSync(path.join(root, 'KTB_AUCTION_V2.html'), html);
console.log(`Wrote KTB_AUCTION_V2.html (${allResults.length} disclosure/plan rows; ${snapshot.plans.length} months)`);

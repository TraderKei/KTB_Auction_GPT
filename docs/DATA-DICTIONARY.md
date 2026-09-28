# KTB TERMINAL — 데이터 사전 & 엔티티 관계 (역설계 참조 문서)

> 화면 설계 Mock-up `ktb-terminal.html`의 동반 문서.
> 모든 화면 데이터 셀은 `data-field` / `data-source` / `data-freq` 속성으로 이 사전과 1:1 매핑됨.
> 기준시점 2026-09. 모든 수치는 현실적 더미데이터.

## 원천(Source) 코드

| 코드 | 원천 시스템 | 비고 |
|---|---|---|
| `MOEF_KTB` | 기획재정부 국고채권 통합정보시스템 (ktb.moef.go.kr) | 발행계획·입찰공고·결과공시·발행조건 |
| `BOK_ECOS` | 한국은행 ECOS / BOK-Wire+ | 입찰 집행결과, 시장금리 시계열, 기준금리 |
| `KOFIA` | 금융투자협회 민평금리 | 스프레드 산출용 (유료/회원) |
| `DERIVED` | 파생 (자체계산) | 원천 필드로부터 산식 계산 |
| `EST` | 추정 (미공시) | 공시되지 않아 역산·추정 필요 — **추정 배지** 표기 |

---

## 1. 데이터 사전 (Data Dictionary)

| 필드ID | 한글명 | 타입 | 단위 | 예시값 | 원천 | 원천 화면명 | 갱신주기 | 파생 | 산식 | Primary Key 관계 |
|---|---|---|---|---|---|---|---|---|---|---|
| `auc.bid_date` | 입찰일 | date | YYYY-MM-DD | 2026-09-09 | 기재부 | 입찰공고/결과공시 | 발행공고 T-3일 | N | — | auction_result(bid_date,isin,tranche) |
| `bond.isin` | 종목코드(ISIN) | string | — | KR103501GD68 | 기재부 | 종목별 발행조건 | 발행공고 T-3일 | N | — | bond_master(isin) **PK** |
| `bond.name` | 종목명 | string | — | 국고02750-3509(24-6) | 기재부 | 종목별 발행조건 | 발행공고 T-3일 | N | — | bond_master(isin) |
| `bond.maturity` | 만기구간 | enum | 년 | 10Y | 기재부 | 종목별 발행조건 | 발행공고 T-3일 | N | — | bond_master(isin) |
| `bond.coupon` | 표면금리 | number | % | 2.750 | 기재부 | 종목별 발행조건 | 발행공고 T-3일 | N | — | bond_master(isin) |
| `auc.tranche` | 차수 | string | — | 24-6 | 기재부 | 입찰공고 | 발행공고 T-3일 | N | — | auction_result **PK 일부** |
| `auc.type` | 입찰유형 | enum | — | 경쟁입찰 | 기재부 | 입찰공고 | 발행공고 T-3일 | N | — | auction_result(type) |
| `auc.plan_amt` | 발행예정액 | number | 억원 | 22,000 | 기재부 | 입찰공고/월간계획 | 발행공고 T-3일 | N | — | auction_schedule(plan_amt) |
| `auc.bid_amt` | 응찰액 | number | 억원 | 63,800 | 한은 | 입찰집행결과(BOK-Wire+) | 입찰일 T+0 16:00 | N | — | auction_result(bid_amt) |
| `auc.won_amt` | 낙찰액 | number | 억원 | 22,000 | 기재부 | 입찰결과공시 | 입찰일 T+0 16:00 | N | — | auction_result(won_amt) |
| `auc.high_rate` | 최고낙찰금리 | number | % | 2.968 | 한은 | 입찰집행결과 | 입찰일 T+0 16:00 | N | — | auction_result(high_rate) |
| `auc.wavg_rate` | 가중평균낙찰금리 | number | % | 2.951 | 한은 | 입찰집행결과 | 입찰일 T+0 16:00 | N | — | auction_result(wavg_rate) |
| `auc.bid_to_cover` | 응찰률 (Bid-to-Cover) | number | 배 | 2.90 | 파생 | — | 입찰일 T+0 16:00 | **Y** | 응찰액 ÷ 발행예정액 | auction_result 파생 |
| `auc.won_rate` | 낙찰률 | number | % | 34.7 | 파생 | — | 입찰일 T+0 16:00 | **Y** | 낙찰액 ÷ 응찰액 | auction_result 파생 |
| `auc.tail` | 테일 (Tail) | number | bp | 1.7 | 파생 | — | 입찰일 T+0 16:00 | **Y** | 최고 − 가중평균 낙찰금리 | auction_result 파생 |
| `auc.spread_vs_mts` | 민평대비 스프레드 | number | bp | +0.6 | 파생(+KOFIA) | 금투협 민평금리 | 입찰일 T+0 16:00 | **Y** | 가중평균낙찰 − 입찰전일 민평 (음수=강세) | auction_result × kofia_yield |
| `auc.noncomp_amt` | 비경쟁인수액 | number | 억원 | 2,200 | 기재부 | 입찰결과공시 | 입찰일 T+1 | N | — | auction_result(noncomp_amt) |
| `auc.pd_count` | 참여 PD수 | number | 개 | 18 | 기재부 | 입찰결과공시 | 입찰일 T+0 16:00 | N | — | auction_result(pd_count) |
| `auc.pay_date` | 납입일 | date | — | 2026-09-10 | 기재부 | 입찰공고 | 발행공고 T-3일 | N | — | auction_schedule(pay_date) |
| `auc.cutoff_tier` | 차등가격 낙찰구간 | array | %/억 | [2.94, 5500] | **추정** | 미공시(EST) | 입찰일 T+0 (추정) | **Y** | 구간별 낙찰액 미공시(역산 불가) → OHLC형 3금리로 대체 | auction_result 파생(추정) |
| `auc.low_rate` | 최저낙찰금리 | number | % | 2.905 | 기재부 | 입찰결과공시 | 입찰일 T+0 16:00 | N | 최저 낙찰금리(결과공시값 그대로) | auction_result(low_rate) |
| `auc.partial_alloc_rate` | 부분낙찰률 | number | % | 41.7 | 기재부 | 입찰결과공시 | 입찰일 T+0 16:00 | N | 최고금리 배정액 ÷ 최고금리 응찰액 × 100 (공시값 그대로) | auction_result(partial_alloc_rate) |
| `dmd.score` | 수요강도 스코어 | number | 0~100 | 47 | 파생 | — | 입찰일 T+0 16:00 | **Y** | z(BTC)×0.4 − z(Tail)×0.3 − z(Spr)×0.3 → 정규화 | demand_index 파생 |
| `plan.month_total` | 월 발행계획액 | number | 조원 | 15.2 | 기재부 | 월간 발행계획 | 월간 전월말목 09:00 | N | — | issuance_plan(month,total) |
| `plan.annual_total` | 연간계획 총액 | number | 조원 | 240 | 기재부 | 연간 국채발행계획 | 연간 전년말 | N | — | issuance_plan(year,total) |
| `plan.progress_by_mat` | 만기별 진도율 | number | % | 67.7 | 파생 | — | 입찰일 T+0 | **Y** | 만기별 실적 ÷ 계획 | issuance_plan × auction_result |
| `plan.annual_yoy` | 연간계획 YoY 증감 | number | 조원/% | +5.0 / +10.6 | 파생 | — | 연간 전년말 | **Y** | 당해 연간계획 − 전년 연간계획 (만기별) | issuance_plan(year,mat) |
| `plan.month_yoy` | 동월계획 YoY 증감 | number | 조원/% | +0.6 / +14.0 | 파생 | — | 월간 전월말목 09:00 | **Y** | 당해 동월계획 − 전년 동월계획 (만기별) | issuance_plan(year,month,mat) |
| `plan.ytd_yoy` | YTD 누적 YoY 증감 | number | 조원/% | +3.9 / +9.8 | 파생 | — | 월간 전월말목 09:00 | **Y** | Σ당해(1~기준월) − Σ전년(1~기준월) (만기별) | issuance_plan(year,month,mat) |
| `plan.month_mom` | 당월계획 MoM 증감 | number | 조원/% | +0.2 / +4.7 | 파생 | — | 월간 전월말목 09:00 | **Y** | 당월계획 − 당해 전월계획 (만기별, 1월은 전년12월 대비) | issuance_plan(year,month,mat) |
| `sd.redeem` | 만기상환액 | number | 조원 | 7.1 | 기재부 | 상환일정 | 월간 | N | — | redemption_schedule(month,amt) |
| `sd.buyback` | 매입(바이백)액 | number | 조원 | 1.3 | 기재부 | 매입결과공시 | 입찰일 T+0 | N | — | buyback_exchange(type=BB) |
| `sd.exchange` | 교환 순증감 | number | 조원 | 0.0 | 기재부 | 교환결과공시 | 입찰일 T+0 | N | — | buyback_exchange(type=EX) |
| `sd.net_supply` | 순공급 | number | 조원 | +6.8 | 파생 | — | 입찰일 T+0 | **Y** | 발행 − 상환 − 바이백 ± 교환 | 월별 집계 파생 |
| `ncb.bond_name` | (비경쟁) 종목명 | string | — | 국고02750-3509(24-6) | 기재부 | 입찰결과공시 | 입찰일 T+0 | N | — | bond_master(bond_name) |
| `ncb.tranche` | (비경쟁) 차수 | string | — | 24-6 | 기재부 | 입찰공고 | 입찰일 T+0 | N | — | auction_schedule(tranche) |
| `ncb.won_amt` | 경쟁낙찰액 | number | 억원 | 15,200 | 기재부 | 입찰결과공시 | 입찰일 T+0 | N | — | auction_result(won_amt) |
| `ncb.noncomp_amt` | 비경쟁인수액 | number | 억원 | 2,200 | 기재부 | 입찰결과공시 | 입찰일 T+1 | N | — | auction_result(noncomp_amt) |
| `ncb.pd_count` | 참여 PD수 | number | 개 | 18 | 기재부 | 입찰결과공시 | 입찰일 T+0 16:00 | N | — | auction_result(pd_count) |
| `ncb.noncomp_ratio` | 비경쟁 비중 | number | % | 12.6 | 파생 | — | 입찰일 T+1 | **Y** | 비경쟁인수액 ÷ (경쟁낙찰액 + 비경쟁인수액) | auction_result 파생 |
| `ncb.type_amt` | 비경쟁 유형별 인수액 | number | 억원 | 6,400 | 기재부 | 입찰결과공시 | 입찰일 T+0 | N | 유형(nc1~nc4)별 집계 | auction_schedule(auction_type) + auction_result |
| `auc.auction_date` | 입찰일(RESULTS) | date | — | 2026-09-09 | 기재부 | 입찰공고 | 발행공고 T-3일 | N | — | auction_schedule(auction_date) |
| `plan.group_mix` | 만기그룹 비중 | number | % | 42.0 | 기재부 | 연간 국채발행계획 | 연간 전년말 | N | 단기/중기/장기 그룹별 계획 비중 | issuance_plan(만기그룹 집계) |
| `plan.group_mix_shift` | 그룹 비중 증감 | number | %p | +1.5 | 파생 | — | 연간 전년말 | **Y** | 당해 그룹비중 − 전년 그룹비중 | issuance_plan(그룹 비중 파생) |
| `plan.group_amt_est` | 그룹 계획액 | number | 조원 | 100.8 | 기재부 | 연간 국채발행계획 | 연간 전년말 | N | 만기그룹별 계획액 집계(당해 미확정시 EST) | issuance_plan(그룹 집계) |
| `plan.group_issue` | 그룹 발행 비교 | number | 조원 | 96.5 | 기재부 | 연간 국채발행계획 | 연간 전년말 | N | 만기그룹별 전년/당해 발행 비교(당해 미확정시 EST) | issuance_plan(그룹 집계) |
| `plan.group_net` | 그룹 순증 | number | 조원 | +4.3 | 파생 | — | 연간 전년말 | **Y** | 만기그룹별 발행 − 상환 순증 | issuance_plan × redemption_schedule(그룹 파생) |
| `pd.comp_won` | PD 경쟁낙찰액 | number | 조원 | 18.4 | 기재부 | PD 실적공시 | 월간 | N | — | pd_allotment(pd_id,comp_won) |
| `pd.nc2_amt` | 비경쟁II 인수액 | number | 조원 | 2.6 | 기재부 | PD 실적공시 | 옵션행사일 T+0 | N | — | pd_allotment(pd_id,nc2_amt) |
| `pd.option_limit` | 옵션 한도 | number | 조원 | 3.7 | **추정** | 미공시(EST) | 입찰일 T+0 (추정) | **Y** | 낙찰액 × 옵션비율 추정 | pd_allotment 파생(추정) |
| `pd.option_exercise_rate` | 옵션 행사율 | number | % | 70 | 파생 | — | 옵션행사일 T+0 | **Y** | 비경쟁인수액 ÷ 옵션한도 | pd_allotment 파생 |

---

## 2. 엔티티 관계 (7 Tables)

```
┌──────────────────┐        ┌──────────────────────┐
│  bond_master     │        │  issuance_plan       │
│  PK isin         │        │  PK (year,month,mat) │
│  · name,maturity │        │  · plan_amt          │
│  · coupon,issue  │        │  · auction_date      │
└────────┬─────────┘        └──────────┬───────────┘
         │ 1:N                         │ 1:N
         ▼                             ▼
┌──────────────────────────────────────────────────┐
│  auction_schedule                                 │
│  PK (isin, tranche)   FK isin → bond_master       │
│  · plan_amt, auction_date, pay_date, type         │
└────────┬──────────────────────────────────────────┘
         │ 1:1
         ▼
┌──────────────────────────────────────────────────┐
│  auction_result                                   │
│  PK (isin, tranche)   FK → auction_schedule       │
│  · bid_amt, won_amt, high_rate, wavg_rate         │
│  · noncomp_amt, pd_count                          │
│  ⇒ 파생: bid_to_cover, tail, spread_vs_mts        │
└────────┬───────────────────────┬──────────────────┘
         │ 1:N                    │ 1:N
         ▼                        ▼
┌──────────────────┐   ┌──────────────────────────┐
│  pd_allotment    │   │  buyback_exchange        │
│  PK (isin,tr,    │   │  PK (auction_date,type)  │
│      pd_id)      │   │  · type(BB/EX)           │
│  · comp_won      │   │  · amount, net_change    │
│  · nc2_amt       │   └──────────────────────────┘
│  · option_limit* │
└──────────────────┘   ┌──────────────────────────┐
                       │  redemption_schedule     │
   * = 추정필드         │  PK (isin, redeem_date)  │
                       │  FK isin → bond_master   │
                       │  · redeem_amt            │
                       └──────────────────────────┘
```

**관계 요약**
- `bond_master` 1─N `auction_schedule` 1─1 `auction_result` 1─N `pd_allotment`
- `bond_master` 1─N `redemption_schedule`
- `buyback_exchange` 는 종목 다수를 묶는 이벤트(경과물↔지표물 교환 / 매입)
- 순공급 = Σ(auction_result.won_amt) − Σ(redemption_schedule.redeem_amt) − Σ(buyback.amount) ± Σ(exchange.net_change)

---

## 3. 수집 난이도 & 리스크

| 항목 | 공시 여부 | 비고 / 수집 방법 | 난이도 |
|---|---|---|---|
| `auc.bid_amt` / `high_rate` / `wavg_rate` | 공개 | 한은 BOK-Wire+ 집행결과 및 기재부 결과공시로 확보 가능 | 낮음 |
| `auc.cutoff_tier` (구간별 낙찰) | **비공개(역산 불가)** | 차등가격 구간별 낙찰액은 미공시 → 응찰 히스토그램 역산 불가. 공시되는 최저·가중평균·최고 낙찰금리 + 부분낙찰률(OHLC형)로 대체 | 높음 |
| `auc.spread_vs_mts` (민평대비) | 공개(유료) | 금투협 민평금리는 유료구독/회원 접근 → 라이선스 확인 필요 | 중간 |
| `pd.option_limit` (PD별 옵션한도) | **비공개(추정필요)** | PD별 옵션 한도·행사 세부는 미공시 → 총량기준 추정 | 높음 |
| `plan.month_total` (월간계획) | 공개 | 전월말 목요일 공표 정형 데이터 → 파싱 안정 | 낮음 |
| `sd.redeem` (만기상환) | 공개 | 종목별 만기일 기반 산출 가능 (bond_master로 자체계산) | 낮음 |
| `dmd.score` (수요강도) | 공개(파생) | 원천지표 확보 시 자체계산 → 원천 신뢰도에 종속 | 중간 |

---

## 4. 다음 단계 — 역설계 시 우선 확보 데이터 3순위

| 순위 | 데이터 | 이유 | 확보 경로 |
|---|---|---|---|
| **1** | `auction_result` 핵심 5필드 (응찰액·낙찰액·최고/가중평균금리·PD수) | 모든 파생지표(BTC·테일·수요강도)의 뿌리. 이것만 있으면 화면 70% 구동 | 기재부 결과공시 + 한은 집행결과 (공개, 정형) |
| **2** | `issuance_plan` (월간·연간 발행계획) | 진도율·순공급의 분모. 공표 정형화되어 파싱 안정적 | MOEF_KTB 월간 발행계획 (전월말 목요일) |
| **3** | KOFIA 민평금리 시계열 | 민평대비 스프레드(수요강도 30% 가중)의 필수 입력. 유료 라이선스 선확인 | 금투협 채권정보센터 (유료/회원) |

> **추정 배지** 필드(차등가격 구간·PD 옵션한도)는 공시되지 않아 역산·추정이 필요하며, 정확도 검증 전까지 지표 신뢰구간을 함께 표기해야 함.

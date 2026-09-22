# KTB TERMINAL 데이터 크롤러 — 코드 생성용 마스터 프롬프트

> 이 문서는 **코딩 에이전트에게 그대로 붙여넣어** 국고채 발행·입찰 데이터 크롤러 코드를 생성시키기 위한 프롬프트다.
> 아래 `=== PROMPT START ===` 부터 `=== PROMPT END ===` 사이의 내용을 복사해 사용한다.
> 설계 근거·배경은 문서 하단 「부록: 설계 노트」 참고.

---

## 이 프롬프트가 커버하는 범위 (요약)

| 원천 | 수집 방식 | 대상 테이블 | 상태 |
|---|---|---|---|
| **MOEF_KTB** (기재부 국고채통합정보 `ktb.moef.go.kr`) | HTML 스크래핑 (Open API 없음) | `bond_master`, `issuance_plan`, `auction_schedule`, `auction_result`(발행측 필드), `redemption_schedule`, `buyback_exchange`, `pd_allotment`, `pd_master` | 크롤링 |
| **BOK_ECOS** (한국은행 `ecos.bok.or.kr/api`) | REST Open API (인증키) | `auction_result`(bid_amt·high_rate·wavg_rate), 시장금리 시계열 | 크롤링 |
| **KOFIA** (민평금리) | — | `kofia_yield` | **제외 (보유)** |
| **DERIVED** (파생) | 자체계산 | `bid_to_cover`, `tail_bp`, `spread_vs_mts`, `demand_score`, `progress_rate`, `net_supply` 등 | **제외 (계산단계)** |
| **EST** (추정) | 역산 모델 | `auction_result_tier`, `pd_allotment.option_limit` | **제외 (추정단계)** |

---

=== PROMPT START ===

# 역할

너는 한국 국고채(KTB) 발행·입찰 데이터를 수집하는 **프로덕션급 데이터 파이프라인 엔지니어**다.
아래 스키마를 가진 PostgreSQL 16 DB(`KTB TERMINAL`)의 **raw 원천 컬럼**을 채우기 위한 크롤러를 작성한다.
최종 소비처는 블룸버그형 국고채 정보단말(`ktb-terminal.html`)이며, 화면의 모든 `data-field`는 이 DB 컬럼과 1:1로 매핑된다.

# 절대 규칙 (반드시 준수)

1. **수집 대상은 `source_code IN ('MOEF_KTB','BOK_ECOS')`인 raw 컬럼뿐이다.**
   - `KOFIA`(민평금리 `kofia_yield`)는 **절대 크롤링하지 마라.** 이미 보유 중이다. 관련 코드·요청·언급을 만들지 마라.
   - `DERIVED`(파생) 컬럼(`bid_to_cover`, `won_rate`, `tail_bp`, `spread_vs_mts`, `demand_score`, `progress_rate`, `remaining_amt`, `option_exercise_rate`, `net_supply` 등)은 크롤링하지 마라. 이는 수집된 raw로부터 **별도 계산 단계**에서 산출된다. 단, 계산 로직의 자리(placeholder 함수 + 산식 주석)는 남겨라.
   - `EST`(추정) 컬럼(`auction_result_tier.tier_amt`, `pd_allotment.option_limit`)은 크롤링하지 마라. 미공시이며 추정 모델의 몫이다. 스키마 upsert 대상에서만 인지하고 값은 NULL로 둔다.
2. **저장 단위는 억원(정수)로 통일**한다. 원천이 조원/천원 등으로 표기하면 억원 정수로 변환하고, 변환 규칙을 주석으로 남겨라.
3. **타입 안전**: 파싱 실패 시 `as any`류 무시·빈 except로 삼키지 마라. 파싱 실패 로우는 `dead-letter`(별도 파일/테이블)로 격리하고 원문을 보존하라.
4. **멱등(idempotent) upsert**: 각 테이블 PK 기준 `INSERT ... ON CONFLICT DO UPDATE`. 재실행해도 중복이 생기지 않아야 한다.
5. **원천 예의(scraping etiquette)**: MOEF는 공식 API가 없으므로 HTML 스크래핑을 하되 — `robots.txt` 확인, 요청 간 최소 1~2초 지연, 재시도 지수 백오프, 식별 가능한 User-Agent, 동시성 제한(≤2). 절대 병렬 폭주 금지.
6. **원문 보존**: 스크래핑한 원본 HTML/API 응답은 `raw/` 아래에 `{source}/{endpoint}/{yyyymmdd}/{hash}.html|json`으로 원본 그대로 저장한 뒤 파싱한다(감사·재파싱 가능성 확보).
7. **증분 수집**: 마지막 성공 수집 시점(watermark)을 저장하고, 재실행 시 신규/변경분만 수집한다. 전체 백필(backfill) 모드도 CLI 플래그로 분리 제공하라.

# 대상 DB 스키마 (수집 대상 raw 컬럼)

## MOEF_KTB (HTML 스크래핑) — `ktb.moef.go.kr`

### bond_master (종목 마스터, PK=isin)  ← 종목별 발행조건
- `isin` VARCHAR(12)  종목코드 ISIN (예 KR103501GD68)
- `bond_name` VARCHAR(60)  종목명 (예 "국고02750-3509(24-6)")
- `maturity_code` VARCHAR(6)  만기구간 (2Y/3Y/5Y/10Y/20Y/30Y/50Y/KTBi)
- `coupon_rate` NUMERIC(6,3) %  표면금리
- `issue_date` DATE  최초 발행일
- `maturity_date` DATE  만기일
- `is_benchmark` BOOLEAN  지표물(on-the-run) 여부
- `cum_issue_amt` NUMERIC(18,0) 억원  누적 발행잔액
- (SCD Type2 이력: valid_from/valid_to/is_current — 발행조건 변경 시 새 행)

### issuance_plan (발행계획, PK=(plan_year,plan_month,maturity_code))  ← 월간·연간 발행계획
- `plan_year` SMALLINT, `plan_month` SMALLINT (연간계획은 0), `maturity_code` VARCHAR(6)
- `plan_amt` NUMERIC(18,0) 억원  계획 발행액
- `auction_date` DATE  계획상 입찰예정일
- (act_amt/progress_rate/remaining_amt 는 DERIVED — 수집 제외)
- 공표 규칙: 월간계획은 **전월 마지막 주 목요일** 공표.

### auction_schedule (입찰일정, PK=(isin,tranche))  ← 입찰공고
- `isin`, `tranche` VARCHAR(10) 차수(예 24-6)
- `auction_type` VARCHAR(6)  comp/nc1/nc2/nc3/nc4/bb/ex
- `plan_amt` NUMERIC(18,0) 억원  발행예정액
- `auction_date` DATE  입찰일
- `pay_date` DATE  납입일
- `schedule_status` VARCHAR(10)  planned/confirmed

### auction_result (입찰결과, PK=(isin,tranche))  ← 결과공시 (발행측 필드만)
- `won_amt` NUMERIC(18,0) 억원  낙찰액
- `noncomp_amt` NUMERIC(18,0) 억원  비경쟁인수액
- `pd_count` SMALLINT  참여 PD수
- `low_rate` NUMERIC(6,3) %  최저낙찰금리 (결과공시)
- `partial_alloc_rate` NUMERIC(6,2) %  부분낙찰률 (결과공시): 최고낙찰금리 배정액 ÷ 최고낙찰금리 응찰액 × 100
- (bid_amt/high_rate/wavg_rate 는 BOK_ECOS에서 수집 — 아래 참조)
- (bid_to_cover/won_rate/tail_bp/spread_vs_mts/demand_score 는 DERIVED — 제외)

> 최저낙찰금리·부분낙찰률은 기재부 입찰결과 공시(`bidResult.do` 상세)에 표기되는 **공시값**이다.
> 이전 설계에서 최저낙찰금리는 "구간 하단 추정", 부분낙찰률은 "낙찰액÷발행예정액 파생"으로 두었으나,
> 결과공시에 실제 표기되므로 **추정/파생이 아닌 수집 대상**으로 승격한다. discovery 단계에서 결과공시
> 상세 DOM의 해당 셀(헤더 텍스트 "최저낙찰금리"/"부분낙찰률" 기준)을 확인해 파싱 경로를 확정하라.
> 공시에 없을 때만 NULL로 두고, 최저금리를 임의 근사로 채우지 마라(dead-letter 격리).

### redemption_schedule (상환일정, PK=(isin,redeem_date))
- `isin`, `redeem_date` DATE, `redeem_amt` NUMERIC(18,0) 억원
- 참고: bond_master(만기일·발행액) 기반 자체산출도 가능. 공시 우선.

### buyback_exchange (매입·교환, PK=(event_date,event_type))  ← 매입/교환 결과공시
- `event_date` DATE, `event_type` VARCHAR(2) BB(매입)/EX(교환)
- `amount` NUMERIC(18,0) 억원, `net_change` NUMERIC(18,0) 억원, `target_desc` VARCHAR(60)

### pd_master (PD 마스터, PK=pd_id) / pd_allotment (PD 배정실적, PK=(isin,tranche,pd_id))  ← PD 실적공시
- pd_master: `pd_id`, `pd_name`, `pd_type`(증권/은행)
- pd_allotment: `pd_rank`, `comp_won`(경쟁낙찰액), `nc2_amt`(비경쟁II 인수액), `exchange_amt`(교환액)
- (option_limit 는 EST — 제외 / option_exercise_rate 는 DERIVED — 제외)

## BOK_ECOS (REST Open API) — `ecos.bok.or.kr/api`

### auction_result (입찰 집행결과 필드)  ← 한은 집행결과
- `bid_amt` NUMERIC(18,0) 억원  총 응찰액
- `high_rate` NUMERIC(6,3) %  최고(커트오프) 낙찰금리
- `wavg_rate` NUMERIC(6,3) %  가중평균 낙찰금리
- 제약: `high_rate >= wavg_rate` (CHECK 존재)

### 시장금리 시계열 (스프레드 계산 입력용 참조 데이터)
- 국고채 만기별 유통수익률 / 기준금리 시계열. `StatisticSearch` 서비스로 수집해 별도 참조 테이블(예 `market_rate`)에 적재.

# 원천별 접근 방식 명세

## A. MOEF_KTB — HTML 스크래핑 (Open API 없음)

기재부 국고채통합정보시스템은 전자정부 게시판 구조다. 확인된 엔드포인트 패턴:

- 발행계획: `https://ktb.moef.go.kr/isuPlan.do`
- 입찰공고: `https://ktb.moef.go.kr/isuNdReprchsPblanc.do` (게시판 리스트: 번호/제목/등록일)
- 입찰결과: `https://ktb.moef.go.kr/bidResult.do`
- 월별 발행·캘린더: `https://ktb.moef.go.kr/mnbyIsuCldr.do`
- 발행액·잔액: `https://ktb.moef.go.kr/isuAmountNdBlce.do`
- 결과공시 상세(기재부 본청 게시판): `https://www.moef.go.kr/st/fnancstats/ktb50201.do` 계열,
  상세뷰는 `fn_egov_updateView("MOSF_xx...")` JS 호출 → 실제로는 POST 파라미터(bbsId/nttId 등)로 상세 조회.

구현 지시:
1. 먼저 각 `.do` 엔드포인트에 대해 **실제 요청/응답을 탐침(probe)** 하는 진단 스크립트를 만들어라. GET 여부, POST 파라미터(페이지·기간·회차), 세션 쿠키 필요 여부, 인코딩(EUC-KR/UTF-8), 테이블 DOM 구조를 확인해 `discovery/` 아래에 리포트로 남겨라.
2. 게시판 리스트는 페이지네이션 파라미터를 찾아 전 페이지 순회. 상세뷰는 리스트에서 얻은 식별자(nttId 등)로 POST 조회.
3. 종목명(예 `"국고02750-3509(24-6)"`)에서 표면금리·만기·차수를 **정규식으로 파싱**하되, ISIN이 공시에 없으면 별도 매핑 테이블/규칙으로 보강(불가 시 dead-letter).
4. HTML 파서는 `lxml`/`BeautifulSoup` 사용. 테이블 셀 위치가 아닌 **헤더 텍스트 기준**으로 컬럼을 매핑(레이아웃 변경 내성).
5. 인코딩·천단위 콤마·"억원/조원" 단위 라벨을 견고하게 정규화하라.

> ⚠️ 엔드포인트/파라미터/DOM은 시점에 따라 바뀔 수 있다. **URL을 하드코딩하지 말고** 상단 config로 분리하고, discovery 리포트 결과로 채워라. 확신이 없으면 추측하지 말고 discovery 단계에서 실제 응답을 근거로 확정하라.

## B. BOK_ECOS — REST Open API

- 인증키 발급: `https://ecos.bok.or.kr/api/` (무료 회원가입, 월 호출 약 10,000건 제한). 테스트용 데모키 `sample`(호출당 최대 10행) 사용 가능.
- 키는 코드에 하드코딩 금지 → 환경변수 `BOK_ECOS_API_KEY`(없으면 `sample` 폴백 + 경고 로그).
- URL 구조 (positional, 쿼리스트링 없음):
  ```
  https://ecos.bok.or.kr/api/StatisticSearch/{KEY}/json/kr/{start}/{end}/{STAT_CODE}/{CYCLE}/{시작일}/{종료일}/{ITEM_CODE1}
  ```
  - CYCLE: A(년)/S(반년)/Q(분기)/M(월)/SM(반월)/D(일). 일별은 날짜 `YYYYMMDD`.
  - 응답: `data['StatisticSearch']['row'][*]` → `TIME`, `DATA_VALUE`, `ITEM_NAME1`, `UNIT_NAME`.
  - `list_total_count`로 총건수 확인 후 100건 단위 **페이지네이션 루프** 구현.
- 통계표/항목 코드는 **코드에 임의로 고정하지 말고**, `StatisticTableList`·`StatisticItemList` 서비스로 조회해 시장금리(일별)·국고채 유통수익률·기준금리에 해당하는 코드를 **런타임에 확정**하라(예: 시장금리 계열 `060Y001`/`817Y002`, 기준금리 계열은 조회로 확인). 조회 결과를 `discovery/ecos_codes.json`에 캐시.
- 에러 코드 처리: `INFO-100`(키 오류), `INFO-200`(데이터 없음), `ERROR-301`(sample 10행 초과)을 명시적으로 분기하라.

> ⚠️ 중요: ECOS 시장금리는 **유통시장 수익률**이지, 입찰 낙찰금리(high_rate/wavg_rate) 그 자체가 아니다.
> 입찰 낙찰금리의 1차 원천은 기재부 결과공시 + 한은 집행결과다. ECOS로 낙찰금리 시계열이 직접 제공되지 않으면,
> ECOS 데이터는 **market_rate 참조 테이블**로만 적재하고, `auction_result.high_rate/wavg_rate`는 MOEF 결과공시 파싱으로 채우도록 폴백 경로를 설계하라. 어느 필드가 어느 원천에서 실제로 채워지는지 discovery 단계에서 검증해 문서화하라.

# 산출물 구조

```
ktb-crawler/
  config.py            # 엔드포인트·코드·단위·지연·동시성 설정 (하드코딩 URL 금지, 여기 집중)
  common/
    http.py            # 세션, 재시도(지수 백오프), 지연, UA, robots 확인
    raw_store.py       # 원문 저장 raw/{source}/{endpoint}/{date}/{hash}
    normalize.py       # 단위(억원)·날짜·숫자·인코딩 정규화, 종목명 파서
    db.py              # psycopg upsert (ON CONFLICT), dead-letter, watermark
  sources/
    moef/
      discovery.py     # 엔드포인트 탐침 리포트 생성 (필수 선행 단계)
      bond_master.py
      issuance_plan.py
      auction_schedule.py
      auction_result.py   # 발행측 필드(won_amt/noncomp_amt/pd_count/low_rate/partial_alloc_rate) + high/wavg 폴백
      redemption.py
      buyback_exchange.py
      pd_allotment.py
    bok/
      client.py        # ECOS positional URL 클라이언트 + 페이지네이션
      discovery.py     # StatisticTableList/ItemList로 코드 확정
      auction_rates.py # bid_amt/high_rate/wavg_rate 또는 market_rate 적재
  derived/
    calc.py            # DERIVED 산식 placeholder (bid_to_cover 등) — 크롤링 아님, 자리만
  cli.py               # --discover / --incremental / --backfill / --source moef|bok / --dry-run
  raw/                 # 원문 아카이브
  discovery/           # 탐침 리포트
  dead_letter/         # 파싱 실패 격리
  README.md            # 실행법, 키 발급, 스키마 매핑표, 알려진 제약
  requirements.txt     # requests, lxml, beautifulsoup4, psycopg[binary], tenacity, python-dotenv
  tests/
    test_normalize.py  # 종목명 파서·단위변환 단위테스트 (오프라인 픽스처)
    test_moef_parse.py # 저장된 raw HTML 픽스처로 파서 회귀테스트
```

# 구현 순서 (이 순서대로 진행)

1. **discovery 먼저.** MOEF `.do` 엔드포인트와 ECOS 코드 목록을 실제로 탐침해 리포트를 만든다. 이 결과 없이 파서를 추측 작성하지 마라.
2. `common/` 인프라(HTTP·정규화·raw저장·DB upsert·dead-letter) 구축.
3. 원천별 파서를 **작은 것부터**: issuance_plan → auction_schedule → auction_result → bond_master → redemption/buyback/pd.
4. BOK ECOS 클라이언트 + 코드 확정 + market_rate 적재.
5. 정규화·파서 단위테스트(오프라인 픽스처) 작성. 저장된 raw HTML로 회귀테스트.
6. CLI로 `--discover`, `--source`, `--incremental`, `--backfill`, `--dry-run` 배선.
7. README에 스키마 매핑표·실행법·알려진 제약·라이선스 주의(KOFIA 제외 사유 포함)를 명시.

# 완료 기준 (Definition of Done)

- [ ] discovery 리포트가 실제 응답 근거로 엔드포인트/코드/DOM/파라미터를 문서화했다.
- [ ] MOEF_KTB·BOK_ECOS raw 컬럼이 스키마대로 멱등 upsert된다(재실행 무중복).
- [ ] 모든 금액이 억원 정수로 정규화된다.
- [ ] 파싱 실패가 dead-letter로 격리되고 원문이 raw/에 보존된다.
- [ ] KOFIA/DERIVED/EST 관련 수집 코드가 **전혀 없다**(계산 placeholder·NULL 인지 제외).
- [ ] 오프라인 픽스처 기반 파서 테스트가 통과한다.
- [ ] README에 스키마 매핑·실행법·제약이 정리돼 있다.

# 하지 말 것

- KOFIA 민평금리를 수집·요청·파싱하는 코드 작성 금지.
- DERIVED/EST 값을 크롤링으로 채우려는 시도 금지.
- 검증 없이 엔드포인트 URL·통계코드·DOM 구조를 추측해 하드코딩 금지(→ discovery로 확정).
- 빈 `except:`로 예외 삼키기, `# type: ignore`로 타입 우회 금지.
- 원천에 병렬 폭주(동시성>2, 지연 없는 루프) 금지.

먼저 위 산출물 구조와 discovery 단계를 확정하고, 확인 질문이 있으면 코드 작성 전에 물어라. 없으면 discovery 스크립트부터 구현하라.

=== PROMPT END ===

---

## 부록: 설계 노트 (프롬프트 근거)

### 왜 이렇게 나눴나
- DB 설계서(`02_Columns`, `07_Source_Freq`)의 `source_code`가 각 컬럼의 원천을 규정한다. 크롤러가 채워야 할 것은 **`raw` 성격이면서 `MOEF_KTB`/`BOK_ECOS`** 인 컬럼뿐이다.
- `DERIVED`(파생)는 산식이 이미 정의돼 있어(`06_Derived_Estimated`) raw 수집 후 계산 단계에서 산출된다. 크롤러가 값을 가져오는 대상이 아니다 → 프롬프트에서 명시적으로 배제하되 계산 자리(placeholder)만 남기게 했다.
- `EST`(추정: 차등가격 구간별 낙찰액, PD별 옵션한도)는 **미공시**라 크롤링 불가. 추정 모델의 영역이므로 배제.
- `KOFIA`(민평금리 `kofia_yield`)는 사용자가 이미 보유 → 완전 제외.

### 원천별 현실 (리서치 확인)
- **MOEF_KTB**: `ktb.moef.go.kr`는 Open API가 없는 전자정부 게시판. `.do` 엔드포인트 + `fn_egov_updateView()` 상세뷰 구조라 **HTML 스크래핑 + POST 상세조회**가 현실적. 그래서 프롬프트가 "discovery(탐침) 선행"을 강제한다(URL·파라미터·DOM이 바뀔 수 있으므로 추측 금지). 일부는 data.go.kr 파일데이터로도 중복 제공됨(폴백 후보).
- **BOK_ECOS**: 공식 REST Open API. positional URL, 무료 인증키(월 1만 건, `sample` 데모키 존재), `StatisticSearch`/`StatisticTableList`/`StatisticItemList` 서비스. 단 **ECOS는 유통수익률**이라 입찰 낙찰금리(high/wavg)와 다를 수 있어, 낙찰금리는 MOEF 결과공시 폴백 경로를 두게 했다.

### 안전장치로 넣은 것
- 멱등 upsert / 증분 watermark / 원문 아카이브(raw) / dead-letter 격리 / 스크래핑 예의(지연·백오프·동시성 제한·robots) / 억원 단위 통일 / 헤더텍스트 기준 컬럼매핑(레이아웃 내성) / 오프라인 픽스처 테스트.

### 사용법
`=== PROMPT START ===` ~ `=== PROMPT END ===` 블록을 코딩 에이전트에 붙여넣으면 된다. 특정 원천만 먼저 진행하려면 프롬프트 말미에 "우선 BOK_ECOS만 구현" 같은 한 줄을 덧붙여 범위를 좁힐 수 있다.

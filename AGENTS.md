# AGENTS.md — KTB TERMINAL 프로젝트 작업 지침

> 이 파일은 새 세션의 코딩 에이전트가 **가장 먼저 읽고** 프로젝트 맥락을 파악하기 위한 인수인계 문서다.
> 작업 시작 전 이 문서와 `README.md`, `docs/DATA-DICTIONARY.md`를 먼저 읽어라.

## 1. 프로젝트 개요

**KTB TERMINAL** — 한국 국고채(KTB, Korea Treasury Bond) 발행·입찰 정보단말.

기획재정부 국고채통합정보시스템(MOEF_KTB)과 한국은행 ECOS(BOK_ECOS)를 원천으로,
국고채 발행계획·입찰공고·낙찰결과·PD 실적 등을 수집·정규화하여 블룸버그형 다크 터미널 UI로
제공하는 것이 목표다. 기준시점 2026-09. 현재 저장소에는 **설계 산출물**만 있고 실제
수집 파이프라인/백엔드/프론트 구현은 아직 없다.

## 2. 저장소 구조

| 경로 | 내용 | 성격 |
|---|---|---|
| `design/schema/KTB_TERMINAL_DB_Design.xlsx` | DB 설계서 (10시트: 테이블·컬럼·관계·ERD·Enum·파생/추정·원천주기·DDL·커버리지) | **원본(SSOT)** |
| `design/schema/schema.sql` | 위 설계서 `08_DDL` 시트에서 추출한 PostgreSQL 16 DDL (13 테이블) | 파생 사본 |
| `docs/DATA-DICTIONARY.md` | 데이터 사전 & 엔티티 관계. 화면 셀 ↔ DB 컬럼 1:1 매핑 | 참조 |
| `docs/crawler-prompt.md` | 크롤러 코드 생성용 마스터 프롬프트 (MOEF_KTB / BOK_ECOS 수집 명세) | 참조 |
| `scripts/build_db_design.py` | DB 설계서 Excel을 생성하는 스크립트 (openpyxl) | 도구 |
| `mockup/ktb-terminal.html` | 다크 터미널 UI 화면 목업. 모든 데이터 셀에 `data-field`/`data-source`/`data-freq` 속성 | 참조 |

## 3. 데이터 원천 코드 (반드시 숙지)

| 코드 | 원천 | 수집 방식 | 크롤링 여부 |
|---|---|---|---|
| `MOEF_KTB` | 기획재정부 국고채통합정보시스템 (`ktb.moef.go.kr`) | HTML 스크래핑 (Open API 없음) | **수집 O** |
| `BOK_ECOS` | 한국은행 ECOS (`ecos.bok.or.kr/api`) | REST Open API (인증키) | **수집 O** |
| `KOFIA` | 금융투자협회 민평금리 (`kofia_yield`) | — | **수집 금지 (이미 보유)** |
| `DERIVED` | 파생 (자체계산) | raw 수집 후 계산 단계 산출 | **크롤링 금지 (계산)** |
| `EST` | 추정 (미공시) | 역산·추정 모델 | **크롤링 금지 (추정)** |

## 4. 핵심 규칙 (작업 시 반드시 준수)

1. **저장 단위는 억원(정수)로 통일.** 원천이 조원/천원이면 억원 정수로 변환하고 변환 규칙을 주석으로 남긴다. 표시단위 변환은 화면계층에서 한다.
2. **KOFIA 민평금리는 절대 수집·요청·파싱하지 않는다.** 이미 보유 중. 관련 코드를 만들지 마라.
3. **DERIVED(파생) 컬럼은 크롤링하지 않는다.** (`bid_to_cover`, `won_rate`, `tail_bp`, `spread_vs_mts`, `demand_score`, `progress_rate`, `net_supply` 등) raw 수집 후 별도 계산 단계에서 산출. 계산 로직 자리(placeholder + 산식 주석)만 남긴다.
4. **EST(추정) 컬럼은 크롤링하지 않는다.** (`auction_result_tier.tier_amt`, `pd_allotment.option_limit`) 미공시 → 값은 NULL로 두고 스키마에서만 인지.
5. **타입 안전.** 파싱 실패를 빈 `except:` / `# type: ignore` / `as any`로 삼키지 마라. 실패 로우는 dead-letter로 격리하고 원문을 보존한다.
6. **멱등 upsert.** 테이블 PK 기준 `INSERT ... ON CONFLICT DO UPDATE`. 재실행해도 중복 금지.
7. **스크래핑 예의.** MOEF는 API가 없으므로 HTML 스크래핑: robots.txt 확인, 요청 간 1~2초 지연, 지수 백오프 재시도, 식별 가능한 User-Agent, 동시성 ≤2. 병렬 폭주 금지.
8. **엔드포인트/통계코드/DOM 구조를 추측해 하드코딩하지 마라.** discovery(탐침) 단계에서 실제 응답을 근거로 확정한다. URL은 config로 분리.

## 5. DB 스키마 요점

핵심 관계:
```
bond_master 1─N auction_schedule 1─1 auction_result 1─N pd_allotment
bond_master 1─N redemption_schedule
buyback_exchange (매입/교환 이벤트)
issuance_plan (월간·연간 발행계획)
```
- 코어/이벤트 테이블 외에 차원(`maturity_dim`)·마스터(`source_master`, `pd_master`) 테이블 존재.
- `bond_master`는 SCD Type2 이력 관리 (`valid_from`/`valid_to`/`is_current`).
- 상세는 `design/schema/schema.sql`(DDL 13개)과 `docs/DATA-DICTIONARY.md` 참조.

> **주의**: `schema.sql`은 Excel 설계서에서 파생된 사본이다. 스키마를 변경할 때는
> `KTB_TERMINAL_DB_Design.xlsx`의 `08_DDL` 시트를 원본(SSOT)으로 삼거나, 변경 후
> `scripts/build_db_design.py`로 Excel을 재생성하고 `schema.sql`도 재추출해 둘을 동기화하라.

## 6. 기술 스택 / 컨벤션

- **DB**: PostgreSQL 16
- **크롤러(예정)**: Python — requests, lxml/beautifulsoup4, psycopg[binary], tenacity, python-dotenv
- **BOK_ECOS 키**: 코드에 하드코딩 금지. 환경변수 `BOK_ECOS_API_KEY` (없으면 `sample` 데모키 폴백 + 경고 로그).
- **커밋 컨벤션**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` …).
- **문서 언어**: 한국어 위주 (코드/식별자/커밋 subject는 영문 관례 따름).

## 7. 새 세션 작업 흐름 권장

1. 이 `AGENTS.md` → `README.md` → `docs/DATA-DICTIONARY.md` 순으로 읽어 맥락 파악.
2. DB 관련 작업이면 `design/schema/schema.sql`을 함께 참조.
3. 크롤러 구현이면 `docs/crawler-prompt.md`의 산출물 구조·구현 순서·완료 기준(DoD)을 따른다.
4. UI 작업이면 `mockup/ktb-terminal.html`의 디자인 시스템(CSS 변수)과 `data-*` 규약을 유지한다.

## GitHub 푸시 대상 (2026-10-08 사용자 지정)

- 최종 푸시 대상: `https://github.com/TraderKei/KTB_Auction_GPT.git`.
- 작업 시작 시 `git remote -v`로 대상이 위 저장소인지 확인한다. 기존 원격 `https://github.com/TraderKei/KTB_Auction.git`은 이전 저장소다.
- 2026-10-08 사용자가 원격 설정을 새 저장소로 변경하고 바로 푸시하도록 명시적으로 요청했다.

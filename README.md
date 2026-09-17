# KTB_Auction

**KTB TERMINAL** — 한국 국고채(KTB) 발행·입찰 정보단말 프로젝트.

기획재정부 국고채통합정보시스템(MOEF_KTB)과 한국은행 ECOS(BOK_ECOS)를 원천으로,
국고채 발행계획·입찰공고·낙찰결과·PD 실적 등을 수집·정규화하여 블룸버그형 정보단말 화면으로
제공하는 것을 목표로 한다. 기준시점 2026-09.

## 저장소 구성

| 경로 | 내용 |
|---|---|
| `design/schema/KTB_TERMINAL_DB_Design.xlsx` | DB 설계서 (10개 시트: 테이블·컬럼·관계·ERD·Enum·파생/추정·원천주기·DDL·커버리지) |
| `design/schema/schema.sql` | 위 설계서 `08_DDL` 시트에서 추출한 PostgreSQL 16 CREATE TABLE DDL (13개 테이블) |
| `docs/DATA-DICTIONARY.md` | 데이터 사전 & 엔티티 관계 (역설계 참조 문서) — 화면 셀 ↔ DB 컬럼 1:1 매핑 |
| `docs/crawler-prompt.md` | 데이터 크롤러 코드 생성용 마스터 프롬프트 (MOEF_KTB / BOK_ECOS 수집 명세) |
| `scripts/build_db_design.py` | DB 설계서 Excel(`.xlsx`)을 생성하는 스크립트 (openpyxl) |
| `mockup/ktb-terminal.html` | 화면 설계 Mock-up (다크 터미널 UI, 모든 데이터 셀에 `data-field`/`data-source`/`data-freq` 속성) |

## 데이터 원천

| 코드 | 원천 시스템 | 수집 방식 |
|---|---|---|
| `MOEF_KTB` | 기획재정부 국고채통합정보시스템 (`ktb.moef.go.kr`) | HTML 스크래핑 (Open API 없음) |
| `BOK_ECOS` | 한국은행 ECOS (`ecos.bok.or.kr/api`) | REST Open API (인증키) |
| `KOFIA` | 금융투자협회 민평금리 | 보유 (수집 제외) |
| `DERIVED` | 파생 (자체계산) | raw 수집 후 계산 단계 산출 |
| `EST` | 추정 (미공시) | 역산·추정 모델 |

## DB 스키마 개요 (7 코어 테이블 + 차원/마스터)

`bond_master` 1─N `auction_schedule` 1─1 `auction_result` 1─N `pd_allotment`
그 외 `issuance_plan`, `redemption_schedule`, `buyback_exchange` 등.
상세는 `docs/DATA-DICTIONARY.md` 및 `design/schema/schema.sql` 참조.

## DB 설계서 재생성

```bash
pip install openpyxl
python scripts/build_db_design.py
```

# KTB PD 탭 재기획 — 1단계 기획 개요

> `docs/pd-tab-replan-prompt.md`의 1단계 산출물. 수집 가능한 데이터만으로 `KTB PD` 탭을 재구성한다.
> **개별 PD(딜러명)·옵션한도·옵션행사율을 전면 제거**하고, 공개·정형으로 확보되는 **비경쟁 인수 구조**를 주제로 삼는다.

## 1. 새 탭 정체성

| 항목 | 내용 |
|---|---|
| 탭 코드 | `KTB NCB` (Non-Competitive Bidding) — 기존 `KTB PD` 라벨 대체 |
| 탭 라벨 | `KTB NCB` · 비경쟁 인수 분석 |
| 이 화면이 답하는 질문 (qbanner) | **국고채 비경쟁 인수는 종목·만기·유형별로 얼마이며, 경쟁낙찰 대비 비중과 추세는 어떠한가?** |

이유: `data-scr="pd"` 식별자와 `renderPD()` 함수명은 회귀 위험을 줄이기 위해 그대로 두되(다른 탭 전환 로직과 연결됨), 화면에 노출되는 라벨·제목·내용만 비경쟁 중심으로 교체한다.

## 2. 콘텐츠(패널) 구성 — 3패널

레이아웃: 기존과 동일하게 `grid3` 2열(좌 58% / 우 42%), 높이 720px. 좌측에 메인 블로터 + 하단 유형 요약, 우측에 시계열 차트 + 비경쟁 유형 정의.

### 패널 NCB1 (좌상) — 종목별 비경쟁 인수 현황 [추천·핵심]
- **답하는 질문**: 최근 입찰에서 종목(만기)별 비경쟁 인수액과 경쟁낙찰 대비 비중은?
- **표현**: 블로터 테이블(`table.blot`) + 비경쟁/경쟁 비중 `stack` 막대
- **컬럼 & 데이터 필드**:

| 컬럼 | data-field | source | freq | 비고 |
|---|---|---|---|---|
| 종목(만기) | `ncb.bond_name` | MOEF_KTB | 입찰일 T+0 | bond_master |
| 차수 | `ncb.tranche` | MOEF_KTB | 입찰일 T+0 | auction_schedule |
| 낙찰액(경쟁) | `ncb.won_amt` | MOEF_KTB | 입찰일 T+0 | auction_result.won_amt |
| 비경쟁인수액 | `ncb.noncomp_amt` | MOEF_KTB | 입찰일 T+1 | auction_result.noncomp_amt |
| 참여 PD수 | `ncb.pd_count` | MOEF_KTB | 입찰일 T+0 | auction_result.pd_count (딜러명 없는 집계) |
| 비경쟁 비중 | `ncb.noncomp_ratio` | DERIVED | 입찰일 T+1 | **산식**: `noncomp_amt ÷ (won_amt + noncomp_amt)` |
| 인수구조 | (stack 막대) | DERIVED | — | 경쟁 vs 비경쟁 시각 비중 |

### 패널 NCB2 (우상) — 비경쟁 인수 월별 추세
- **답하는 질문**: 비경쟁 인수 총액과 비중은 시간에 따라 어떻게 움직이나?
- **표현**: Chart.js 콤보(스택 막대 = 경쟁/비경쟁 인수액 조원, 라인 = 비경쟁 비중 %)
- **데이터 필드**:

| 요소 | data-field | source | freq | 비고 |
|---|---|---|---|---|
| 월별 경쟁낙찰액 | `ncb.mth_won` | MOEF_KTB | 월간 | 월 집계 |
| 월별 비경쟁인수액 | `ncb.mth_noncomp` | MOEF_KTB | 월간 | 월 집계 |
| 월별 비경쟁 비중 | `ncb.mth_ratio` | DERIVED | 월간 | `Σnoncomp ÷ Σ(won+noncomp)` |

### 패널 NCB3 (우하, NCB2와 같은 우측 컬럼에 세로 배치) — 비경쟁 유형(I~IV) 구성 + 정의
- **답하는 질문**: 비경쟁 인수가 유형(nc1~nc4)별로 어떻게 나뉘나? 각 유형은 무엇인가?
- **표현**: 유형별 인수액 요약(`speccard`) + 기존 비경쟁 유형 정의 카드 유지
- **데이터 필드**:

| 요소 | data-field | source | freq | 비고 |
|---|---|---|---|---|
| 유형별 인수액(nc1~nc4) | `ncb.type_amt` | MOEF_KTB | 입찰일 T+0 | auction_schedule.auction_type + 결과 |
| 유형별 구성비 | `ncb.type_ratio` | DERIVED | 입찰일 T+0 | 유형액 ÷ 총 비경쟁액 |

> 비경쟁 유형 정의(비경쟁 I 일반인 우선배정 / II PD옵션 / III 스트립조건부 / IV 모집)는 기존 카드를 **정의 설명 용도로만** 유지(수치 없이 텍스트).

## 3. 화면 요소 → data-* 매핑 초안
위 각 패널 표의 data-field/source/freq를 그대로 적용. 파생 지표는 모두 `data-source="DERIVED"` + 산식 명기, EST(추정) 배지는 이 탭에서 **사용하지 않음**.

## 4. 버리는 것 (기존 대비)
- **제거**: 개별 PD 딜러명(A증권·B은행…) 순위 테이블, `opt_lim`(옵션 한도, EST), 옵션 행사율(`nc2/opt_lim`), PD별 옵션 관련 차트/카드.
- **유지·재사용**: 비경쟁 유형(I~IV) 정의 텍스트 카드, 다크 디자인 시스템·컴포넌트(panel/blot/stack/speccard/qbanner).

## 5. 확인 필요 사항
- `pd_count`(참여 PD 수)는 딜러명 없는 집계 수치이므로 사용 가능으로 판단(데이터 사전 `auc.pd_count` = 공개). 문제 없으면 그대로 포함.
- 종목/월별 실제 수치는 아직 크롤러 미구현 → 목업 더미데이터로 채우되, 다른 탭과 동일하게 현실적 규모(억원/조원)로 구성.

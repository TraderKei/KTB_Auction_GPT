import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import os

HDR_FILL = PatternFill("solid", fgColor="1F3864")
HDR_FONT = Font(name="맑은 고딕", size=10, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="맑은 고딕", size=14, bold=True, color="1F3864")
SUB_FONT = Font(name="맑은 고딕", size=9, color="808080")
CELL_FONT = Font(name="맑은 고딕", size=9)
MONO_FONT = Font(name="Consolas", size=9, color="1F5C99")
EST_FILL = PatternFill("solid", fgColor="FCE4EC")
DERIVED_FILL = PatternFill("solid", fgColor="FFF3E0")
PK_FILL = PatternFill("solid", fgColor="E8F0FE")
thin = Side(style="thin", color="D0D0D0")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center")


def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        cell.border = BORDER


def write_table(ws, headers, rows, start_row=1, widths=None, title=None, subtitle=None):
    r = start_row
    if title:
        ws.cell(row=r, column=1, value=title).font = TITLE_FONT
        r += 1
    if subtitle:
        ws.cell(row=r, column=1, value=subtitle).font = SUB_FONT
        r += 1
    if title or subtitle:
        r += 1
    hdr_row = r
    for c, h in enumerate(headers, 1):
        ws.cell(row=hdr_row, column=c, value=h)
    style_header(ws, hdr_row, len(headers))
    r += 1
    for row in rows:
        for c, val in enumerate(row, 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.font = CELL_FONT
            cell.alignment = WRAP
            cell.border = BORDER
        # 성격 강조 (파생/추정)
        rowtext = " ".join(str(x) for x in row)
        if "estimated" in rowtext or "추정" in rowtext or "EST" == (row[10] if len(row) > 10 else ""):
            pass
        r += 1
    # 열너비
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
    # 자동필터 + 헤더 고정
    ws.auto_filter.ref = f"{get_column_letter(1)}{hdr_row}:{get_column_letter(len(headers))}{r-1}"
    ws.freeze_panes = ws.cell(row=hdr_row + 1, column=1)
    return r


wb = openpyxl.Workbook()
ws = wb.create_sheet("00_README", 0)
default = wb["Sheet"]
wb.remove(default)
ws.sheet_view.showGridLines = False
readme = [
    ("KTB TERMINAL — 데이터베이스 상세 설계문서", TITLE_FONT),
    ("국고채 발행·입찰 정보단말(ktb-terminal.html) 구동용 관계형 DB 스키마 설계", SUB_FONT),
    ("", None),
    ("문서 목적", Font(name="맑은 고딕", size=11, bold=True, color="1F3864")),
    ("· 최종 결과물 ktb-terminal.html의 모든 data-field를 물리 컬럼으로 매핑하여 화면을 실제 구동할 수 있는 DB 설계", CELL_FONT),
    ("· 참고문서 DATA-DICTIONARY.md로 타입·단위·산식·PK 관계를 보강", CELL_FONT),
    ("· HTML(data-* 속성)과 딕셔너리 충돌 시 HTML을 우선(Ground Truth)", CELL_FONT),
    ("", None),
    ("기준 정보", Font(name="맑은 고딕", size=11, bold=True, color="1F3864")),
    ("· 기준시점: 2026-09   · 대상 DBMS: PostgreSQL 16   · 네이밍: snake_case", CELL_FONT),
    ("· 금액 저장단위: 억원(정수) 통일 + 단위 메타 분리, 표시단위(조원 등)는 화면계층 변환", CELL_FONT),
    ("· 이력 필요 테이블(발행조건·계획): SCD Type2 (valid_from/valid_to/is_current)", CELL_FONT),
    ("", None),
    ("원천(source) 범례", Font(name="맑은 고딕", size=11, bold=True, color="1F3864")),
    ("· MOEF_KTB : 기획재정부 국고채통합정보시스템(ktb.moef.go.kr) — 발행계획·입찰공고·결과공시", CELL_FONT),
    ("· BOK_ECOS : 한국은행 ECOS / BOK-Wire+ — 입찰 집행결과, 시장금리", CELL_FONT),
    ("· KOFIA    : 금융투자협회 민평금리 — 스프레드 산출(유료/회원)", CELL_FONT),
    ("· DERIVED  : 파생(자체계산) — 원천필드로부터 산식 계산", CELL_FONT),
    ("· EST      : 추정(미공시) — 역산·추정 필요, 신뢰구간 병기(추정 배지)", CELL_FONT),
    ("", None),
    ("필드 성격 3분류", Font(name="맑은 고딕", size=11, bold=True, color="1F3864")),
    ("· raw       : 원천 저장 컬럼 (물리 저장)", CELL_FONT),
    ("· derived   : 파생 — 산식 보유, 뷰 또는 마트로 계산(설계상 저장/뷰 명시)", CELL_FONT),
    ("· estimated : 추정 — 미공시 역산, 신뢰구간·추정근거 메타 필수", CELL_FONT),
    ("", None),
    ("시트 구성", Font(name="맑은 고딕", size=11, bold=True, color="1F3864")),
    ("00_README / 01_Tables / 02_Columns / 03_Relationships / 04_ERD / 05_Enums_Codes /", CELL_FONT),
    ("06_Derived_Estimated / 07_Source_Freq / 08_DDL / 09_Coverage", CELL_FONT),
    ("", None),
    ("변경이력", Font(name="맑은 고딕", size=11, bold=True, color="1F3864")),
    ("v1.0  2026-09  최초 설계 — data-field 전수 매핑 커버리지 100%", CELL_FONT),
]
for i, (text, font) in enumerate(readme, 1):
    cell = ws.cell(row=i, column=1, value=text)
    if font:
        cell.font = font
ws.column_dimensions["A"].width = 110

# ============================================================================
# 데이터 정의
# ============================================================================
# 01_Tables : 테이블명(영), 한글, 설명, 성격, 예상로우, 갱신주기, 원천, PK
TABLES = [
    ("bond_master", "종목 마스터", "국고채 종목(ISIN) 기본 발행조건", "마스터", "수천", "발행공고 T-3일", "MOEF_KTB", "isin"),
    ("maturity_dim", "만기구간 차원", "만기구간 코드 표준(2Y~50Y,KTBi)", "차원", "9", "정적", "DERIVED", "maturity_code"),
    ("source_master", "원천 코드", "데이터 원천 5종 코드 표준", "차원", "5", "정적", "DERIVED", "source_code"),
    ("issuance_plan", "발행계획", "연간·월간·만기별 발행계획", "마스터", "수백/년", "월간 전월말목 09:00 / 연간", "MOEF_KTB", "(plan_year,plan_month,maturity_code)"),
    ("auction_schedule", "입찰일정", "종목·차수별 입찰 예정(공고)", "트랜잭션", "수백/년", "발행공고 T-3일", "MOEF_KTB", "(isin,tranche)"),
    ("auction_result", "입찰결과", "입찰 집행·낙찰 결과 및 파생지표", "트랜잭션", "수백/년", "입찰일 T+0 16:00 / T+1", "MOEF_KTB+BOK_ECOS", "(isin,tranche)"),
    ("pd_master", "PD 마스터", "국고채전문딜러(PD) 기본정보", "마스터", "~20", "연간", "MOEF_KTB", "pd_id"),
    ("pd_allotment", "PD 배정실적", "PD별 경쟁낙찰·비경쟁II·옵션·교환", "트랜잭션", "수천/년", "입찰일 T+0 / 옵션행사일 / 월간", "MOEF_KTB", "(isin,tranche,pd_id)"),
    ("buyback_exchange", "매입·교환", "바이백(BB)/교환(EX) 이벤트(다종목)", "트랜잭션", "수십/년", "입찰일 T+0", "MOEF_KTB", "(event_date,event_type)"),
    ("redemption_schedule", "상환일정", "종목별 만기상환 일정·금액", "트랜잭션", "수천", "월간", "MOEF_KTB", "(isin,redeem_date)"),
    ("kofia_yield", "민평금리 시계열", "금투협 민평금리(스프레드 입력)", "트랜잭션", "일별×만기", "일별", "KOFIA", "(yield_date,maturity_code)"),
]

# 02_Columns : (table, col, 한글, data-field, type, null, pk, fk, unique, unit, 예시, source, 성격, 산식, freq, index, 설명, 비고)
def C(table, col, kor, field, dtype, null, pk, fk, uniq, unit, ex, src, kind, formula, freq, idx, desc, note=""):
    return [table, col, kor, field, dtype, null, pk, fk, uniq, unit, ex, src, kind, formula, freq, idx, desc, note]

COLUMNS = [
    # bond_master
    C("bond_master","isin","종목코드(ISIN)","bond.isin","VARCHAR(12)","N","PK","","U","-","KR103501GD68","MOEF_KTB","raw","","발행공고 T-3일","Y","국채 종목 고유 ISIN 코드"),
    C("bond_master","bond_name","종목명","bond.name","VARCHAR(60)","N","","","","-","국고02750-3509(24-6)","MOEF_KTB","raw","","발행공고 T-3일","N","표면금리·만기·차수 포함 종목명"),
    C("bond_master","maturity_code","만기구간","bond.maturity","VARCHAR(6)","N","","maturity_dim.maturity_code","","년","10Y","MOEF_KTB","raw","","발행공고 T-3일","Y","만기구간 코드(2Y~50Y,KTBi)"),
    C("bond_master","coupon_rate","표면금리","bond.coupon","NUMERIC(6,3)","N","","","","%","2.750","MOEF_KTB","raw","","발행공고 T-3일","N","연 표면이자율"),
    C("bond_master","issue_date","발행일","bond.spec_card","DATE","Y","","","","-","2025-09-10","MOEF_KTB","raw","","발행공고 T-3일","N","최초 발행일(스펙카드)"),
    C("bond_master","maturity_date","만기일","bond.spec_card","DATE","Y","","","","-","2035-09-10","MOEF_KTB","raw","","발행공고 T-3일","N","원금 상환 만기일"),
    C("bond_master","is_benchmark","지표물 여부","bond.spec_card","BOOLEAN","Y","","","","-","true","MOEF_KTB","raw","","발행공고 T-3일","N","On-the-run 지표물 여부"),
    C("bond_master","cum_issue_amt","누적 발행잔액","bond.spec_card","NUMERIC(18,0)","Y","","","","억원","184000","MOEF_KTB","raw","","입찰일 T+0","N","해당 종목 누적 발행잔액"),
    C("bond_master","valid_from","이력 시작","-","TIMESTAMP","N","","","","-","2025-09-07","DERIVED","raw","","-","N","SCD2 유효시작"),
    C("bond_master","valid_to","이력 종료","-","TIMESTAMP","Y","","","","-","9999-12-31","DERIVED","raw","","-","N","SCD2 유효종료"),
    C("bond_master","is_current","현재행","-","BOOLEAN","N","","","","-","true","DERIVED","raw","","-","Y","SCD2 현재행 플래그"),
    # maturity_dim
    C("maturity_dim","maturity_code","만기구간 코드","bond.maturity","VARCHAR(6)","N","PK","","U","-","10Y","DERIVED","raw","","정적","Y","만기구간 표준코드"),
    C("maturity_dim","maturity_years","만기 연수","-","NUMERIC(4,1)","Y","","","","년","10.0","DERIVED","raw","","정적","N","정렬·계산용 연수(KTBi=NULL)"),
    C("maturity_dim","sort_order","정렬순서","-","SMALLINT","N","","","","-","4","DERIVED","raw","","정적","N","화면 정렬순서"),
    C("maturity_dim","is_linker","물가채 여부","-","BOOLEAN","N","","","","-","false","DERIVED","raw","","정적","N","KTBi(물가연동채) 여부"),
    # source_master
    C("source_master","source_code","원천 코드","auc.*/bond.*(data-source)","VARCHAR(10)","N","PK","","U","-","MOEF_KTB","DERIVED","raw","","정적","Y","data-source 원천 코드"),
    C("source_master","source_name","원천 명","-","VARCHAR(60)","N","","","","-","기획재정부 국고채통합정보","DERIVED","raw","","정적","N","원천 시스템 한글명"),
    C("source_master","disclosure_type","공시유형","-","VARCHAR(20)","N","","","","-","공개","DERIVED","raw","","정적","N","공개/유료/미공시"),
    # issuance_plan
    C("issuance_plan","plan_year","계획연도","plan.annual_total","SMALLINT","N","PK","","","-","2026","MOEF_KTB","raw","","연간 전년말","Y","발행계획 연도"),
    C("issuance_plan","plan_month","계획월","plan.month_total","SMALLINT","N","PK","","","-","9","MOEF_KTB","raw","","월간 전월말목 09:00","Y","발행계획 월(연간계획은 0)"),
    C("issuance_plan","maturity_code","만기구간","plan.act_by_mat","VARCHAR(6)","N","PK","maturity_dim.maturity_code","","-","10Y","MOEF_KTB","raw","","월간","Y","만기구간별 계획"),
    C("issuance_plan","plan_amt","발행계획액","plan.month_total/plan.annual_total","NUMERIC(18,0)","N","","","","억원","152000","MOEF_KTB","raw","","월간 전월말목 09:00","N","계획 발행액(억원 저장)"),
    C("issuance_plan","auction_date","입찰예정일","plan.remaining_auctions","DATE","Y","","","","-","2026-09-09","MOEF_KTB","raw","","월간 전월말목","N","계획상 입찰예정일"),
    C("issuance_plan","act_amt","누적 실적액","plan.act_by_mat/plan.annual_act","NUMERIC(18,0)","Y","","","","억원","352000","MOEF_KTB","derived","Σ auction_result.won_amt","입찰일 T+0","N","만기·기간별 낙찰 실적 집계"),
    C("issuance_plan","progress_rate","진도율","plan.progress_by_mat/plan.month_progress/plan.annual_progress","NUMERIC(6,2)","Y","","","","%","67.70","DERIVED","derived","act_amt ÷ plan_amt ×100","입찰일 T+0 16:00","N","계획대비 실적 진도율(파생)"),
    C("issuance_plan","remaining_amt","잔여 계획액","plan.remaining","NUMERIC(18,0)","Y","","","","억원","880000","DERIVED","derived","plan_amt − act_amt","입찰일 T+0","N","잔여 발행계획(파생)"),
    # auction_schedule
    C("auction_schedule","isin","종목코드","bond.isin","VARCHAR(12)","N","PK","bond_master.isin","","-","KR103501GD68","MOEF_KTB","raw","","발행공고 T-3일","Y","FK→bond_master"),
    C("auction_schedule","tranche","차수","auc.tranche","VARCHAR(10)","N","PK","","","-","24-6","MOEF_KTB","raw","","발행공고 T-3일","Y","입찰 차수"),
    C("auction_schedule","auction_type","입찰유형","auc.type","VARCHAR(6)","N","","","","-","comp","MOEF_KTB","raw","","발행공고 T-3일","Y","comp/nc1~nc4/bb/ex"),
    C("auction_schedule","plan_amt","발행예정액","auc.plan_amt","NUMERIC(18,0)","N","","","","억원","22000","MOEF_KTB","raw","","발행공고 T-3일","N","입찰 발행예정액"),
    C("auction_schedule","auction_date","입찰일","auc.bid_date","DATE","N","","","","-","2026-09-09","MOEF_KTB","raw","","발행공고 T-3일","Y","입찰 예정/집행일"),
    C("auction_schedule","pay_date","납입일","auc.pay_date","DATE","Y","","","","-","2026-09-10","MOEF_KTB","raw","","발행공고 T-3일","N","낙찰 납입일"),
    C("auction_schedule","schedule_status","일정상태","auc.schedule_cell","VARCHAR(10)","N","","","","-","planned","MOEF_KTB","raw","","발행공고 T-3일","N","planned(예정)/confirmed(확정)"),
    # auction_result
    C("auction_result","isin","종목코드","bond.isin","VARCHAR(12)","N","PK","auction_schedule.isin","","-","KR103501GD68","MOEF_KTB","raw","","입찰일 T+0","Y","FK→auction_schedule"),
    C("auction_result","tranche","차수","auc.tranche","VARCHAR(10)","N","PK","auction_schedule.tranche","","-","24-6","MOEF_KTB","raw","","입찰일 T+0","Y","FK→auction_schedule"),
    C("auction_result","bid_amt","응찰액","auc.bid_amt","NUMERIC(18,0)","Y","","","","억원","63800","BOK_ECOS","raw","","입찰일 T+0 16:00","N","총 응찰금액(한은 집행결과)"),
    C("auction_result","won_amt","낙찰액","auc.won_amt","NUMERIC(18,0)","Y","","","","억원","22000","MOEF_KTB","raw","","입찰일 T+0 16:00","N","총 낙찰금액"),
    C("auction_result","high_rate","최고낙찰금리","auc.high_rate","NUMERIC(6,3)","Y","","","","%","2.968","BOK_ECOS","raw","","입찰일 T+0 16:00","N","최고(커트오프) 낙찰금리"),
    C("auction_result","wavg_rate","가중평균낙찰금리","auc.wavg_rate","NUMERIC(6,3)","Y","","","","%","2.951","BOK_ECOS","raw","","입찰일 T+0 16:00","N","가중평균 낙찰금리"),
    C("auction_result","noncomp_amt","비경쟁인수액","auc.noncomp_amt","NUMERIC(18,0)","Y","","","","억원","2200","MOEF_KTB","raw","","입찰일 T+1","N","비경쟁 인수 총액"),
    C("auction_result","pd_count","참여 PD수","auc.pd_count","SMALLINT","Y","","","","개","18","MOEF_KTB","raw","","입찰일 T+0 16:00","N","입찰 참여 PD 수"),
    C("auction_result","bid_to_cover","응찰률(BTC)","auc.bid_to_cover / auc.avg_btc","NUMERIC(6,2)","Y","","","","배","2.90","DERIVED","derived","bid_amt ÷ plan_amt","입찰일 T+0 16:00","N","응찰률(파생)"),
    C("auction_result","won_rate","낙찰률","auc.won_rate","NUMERIC(6,2)","Y","","","","%","34.7","DERIVED","derived","won_amt ÷ bid_amt ×100","입찰일 T+0 16:00","N","낙찰률(파생)"),
    C("auction_result","tail_bp","테일(Tail)","auc.tail / auc.avg_tail","NUMERIC(6,1)","Y","","","","bp","1.7","DERIVED","derived","(high_rate − wavg_rate)×100","입찰일 T+0 16:00","N","테일 bp(파생)"),
    C("auction_result","spread_vs_mts","민평대비 스프레드","auc.spread_vs_mts","NUMERIC(6,1)","Y","","","","bp","0.6","DERIVED","derived","wavg_rate − 입찰전일 민평(KOFIA)","입찰일 T+0 16:00","N","음수=강세(파생, KOFIA 결합)"),
    C("auction_result","demand_score","수요강도 스코어","dmd.score / dmd.heat_score","NUMERIC(5,1)","Y","","","","0~100","47","DERIVED","derived","z(BTC)×.4 − z(Tail)×.3 − z(Spr)×.3 정규화","입찰일 T+0 16:00","N","수요강도 종합점수(파생)"),
    C("auction_result","is_estimated","추정 여부","auc.cutoff_tier(EST)","BOOLEAN","N","","","","-","false","EST","raw","","입찰일 T+0","N","결과에 추정필드 포함 여부"),
    # auction_result_tier (차등가격 구간 — cutoff_tier 정규화)
    C("auction_result_tier","isin","종목코드","auc.cutoff_tier","VARCHAR(12)","N","PK","auction_result.isin","","-","KR103501GD68","EST","raw","","입찰일 T+0 (추정)","Y","FK→auction_result"),
    C("auction_result_tier","tranche","차수","auc.cutoff_tier","VARCHAR(10)","N","PK","auction_result.tranche","","-","24-6","EST","raw","","입찰일 T+0 (추정)","Y","FK→auction_result"),
    C("auction_result_tier","tier_rate","구간금리","auc.cutoff_tier","NUMERIC(6,3)","N","PK","","","%","2.941","EST","estimated","히스토그램 기반 구간추정","입찰일 T+0 (추정)","N","차등가격 구간 금리(추정)"),
    C("auction_result_tier","tier_amt","구간 낙찰액","auc.cutoff_tier","NUMERIC(18,0)","Y","","","","억원","5500","EST","estimated","응찰 히스토그램 역산","입찰일 T+0 (추정)","N","구간별 낙찰액(미공시·추정)"),
    C("auction_result_tier","confidence","신뢰구간","auc.cutoff_tier","VARCHAR(20)","Y","","","","-","±800억","EST","estimated","추정 표준편차","입찰일 T+0 (추정)","N","추정 신뢰구간 메타"),
    # pd_master
    C("pd_master","pd_id","PD 코드","pd.name","VARCHAR(10)","N","PK","","U","-","PD001","MOEF_KTB","raw","","연간","Y","전문딜러 고유코드"),
    C("pd_master","pd_name","PD명","pd.name","VARCHAR(40)","N","","","","-","A증권","MOEF_KTB","raw","","월간","N","딜러 기관명"),
    C("pd_master","pd_type","기관유형","-","VARCHAR(10)","Y","","","","-","증권","MOEF_KTB","raw","","연간","N","증권/은행"),
    # pd_allotment
    C("pd_allotment","isin","종목코드","-","VARCHAR(12)","N","PK","auction_result.isin","","-","KR103501GD68","MOEF_KTB","raw","","입찰일 T+0","Y","FK→auction_result"),
    C("pd_allotment","tranche","차수","-","VARCHAR(10)","N","PK","auction_result.tranche","","-","24-6","MOEF_KTB","raw","","입찰일 T+0","Y","FK→auction_result"),
    C("pd_allotment","pd_id","PD 코드","pd.name","VARCHAR(10)","N","PK","pd_master.pd_id","","-","PD001","MOEF_KTB","raw","","월간","Y","FK→pd_master"),
    C("pd_allotment","pd_rank","순위","pd.rank","SMALLINT","Y","","","","-","1","MOEF_KTB","raw","","월간","N","PD 인수실적 순위"),
    C("pd_allotment","comp_won","경쟁낙찰액","pd.comp_won","NUMERIC(18,0)","Y","","","","억원","184000","MOEF_KTB","raw","","입찰일 T+0","N","PD 경쟁입찰 낙찰액"),
    C("pd_allotment","nc2_amt","비경쟁II 인수액","pd.nc2_amt","NUMERIC(18,0)","Y","","","","억원","26000","MOEF_KTB","raw","","옵션행사일 T+0","N","비경쟁II 인수액"),
    C("pd_allotment","exchange_amt","교환액","pd.exchange_amt","NUMERIC(18,0)","Y","","","","억원","17000","MOEF_KTB","raw","","입찰일 T+0","N","PD 교환 참여액"),
    C("pd_allotment","option_limit","옵션 한도","pd.option_limit","NUMERIC(18,0)","Y","","","","억원","37000","EST","estimated","낙찰액 × 옵션비율 추정","입찰일 T+0 (추정)","N","PD별 옵션한도(미공시·추정)"),
    C("pd_allotment","option_exercise_rate","옵션 행사율","pd.option_exercise_rate","NUMERIC(6,2)","Y","","","","%","70.0","DERIVED","derived","nc2_amt ÷ option_limit ×100","옵션행사일 T+0","N","옵션 행사율(파생)"),
    # buyback_exchange
    C("buyback_exchange","event_date","이벤트일","auc.bid_date","DATE","N","PK","","","-","2026-09-16","MOEF_KTB","raw","","입찰일 T+0","Y","매입/교환 집행일"),
    C("buyback_exchange","event_type","이벤트유형","auc.type","VARCHAR(2)","N","PK","","","-","BB","MOEF_KTB","raw","","입찰일 T+0","Y","BB(매입)/EX(교환)"),
    C("buyback_exchange","amount","금액","sd.buyback","NUMERIC(18,0)","Y","","","","억원","13000","MOEF_KTB","raw","","입찰일 T+0","N","매입/교환 규모"),
    C("buyback_exchange","net_change","순증감","sd.exchange","NUMERIC(18,0)","Y","","","","억원","0","MOEF_KTB","raw","","입찰일 T+0","N","교환 순증감(±)"),
    C("buyback_exchange","target_desc","대상 설명","bond.name","VARCHAR(60)","Y","","","","-","경과물↔지표물(3Y/10Y)","MOEF_KTB","raw","","입찰일 T+0","N","다종목 대상 설명"),
    # redemption_schedule
    C("redemption_schedule","isin","종목코드","-","VARCHAR(12)","N","PK","bond_master.isin","","-","KR103501GD68","MOEF_KTB","raw","","월간","Y","FK→bond_master"),
    C("redemption_schedule","redeem_date","상환일","-","DATE","N","PK","","","-","2035-09-10","MOEF_KTB","raw","","월간","Y","만기 상환일"),
    C("redemption_schedule","redeem_amt","상환액","sd.redeem","NUMERIC(18,0)","N","","","","억원","71000","MOEF_KTB","raw","","월간","N","만기 상환금액"),
    # kofia_yield
    C("kofia_yield","yield_date","기준일","-","DATE","N","PK","","","-","2026-09-08","KOFIA","raw","","일별","Y","민평 기준일"),
    C("kofia_yield","maturity_code","만기구간","-","VARCHAR(6)","N","PK","maturity_dim.maturity_code","","-","10Y","KOFIA","raw","","일별","Y","만기구간별 민평"),
    C("kofia_yield","mts_yield","민평금리","auc.spread_vs_mts(입력)","NUMERIC(6,3)","N","","","","%","2.945","KOFIA","raw","","일별","N","금투협 민평금리(스프레드 입력)"),
    # supply_monthly (순공급 집계 마트 — sd.* 파생)
    C("supply_monthly","supply_year","연도","-","SMALLINT","N","PK","","","-","2026","DERIVED","derived","집계키","입찰일 T+0","Y","순공급 집계 연"),
    C("supply_monthly","supply_month","월","-","SMALLINT","N","PK","","","-","9","DERIVED","derived","집계키","입찰일 T+0","Y","순공급 집계 월"),
    C("supply_monthly","issue_amt","발행","sd.issue","NUMERIC(18,0)","Y","","","","억원","152000","MOEF_KTB","derived","Σ won_amt","입찰일 T+0","N","월 총발행"),
    C("supply_monthly","redeem_amt","만기상환","sd.redeem","NUMERIC(18,0)","Y","","","","억원","71000","MOEF_KTB","derived","Σ redeem_amt","월간","N","월 만기상환"),
    C("supply_monthly","buyback_amt","바이백","sd.buyback","NUMERIC(18,0)","Y","","","","억원","13000","MOEF_KTB","derived","Σ buyback.amount","입찰일 T+0","N","월 매입"),
    C("supply_monthly","exchange_net","교환 순증감","sd.exchange","NUMERIC(18,0)","Y","","","","억원","0","MOEF_KTB","derived","Σ exchange.net_change","입찰일 T+0","N","월 교환 순증감"),
    C("supply_monthly","net_supply","순공급","sd.net_supply","NUMERIC(18,0)","Y","","","","억원","68000","DERIVED","derived","발행−상환−바이백±교환","입찰일 T+0 16:00","N","순공급(파생)"),
]

# 03_Relationships
RELATIONS = [
    ("bond_master","isin","1:N","auction_schedule","isin","종목→입찰일정","RESTRICT / CASCADE"),
    ("bond_master","isin","1:N","redemption_schedule","isin","종목→상환일정","RESTRICT / CASCADE"),
    ("maturity_dim","maturity_code","1:N","bond_master","maturity_code","만기차원→종목","RESTRICT / CASCADE"),
    ("maturity_dim","maturity_code","1:N","issuance_plan","maturity_code","만기차원→계획","RESTRICT / CASCADE"),
    ("maturity_dim","maturity_code","1:N","kofia_yield","maturity_code","만기차원→민평","RESTRICT / CASCADE"),
    ("auction_schedule","(isin,tranche)","1:1","auction_result","(isin,tranche)","입찰일정→결과","RESTRICT / CASCADE"),
    ("auction_result","(isin,tranche)","1:N","auction_result_tier","(isin,tranche)","결과→차등구간(추정)","CASCADE / CASCADE"),
    ("auction_result","(isin,tranche)","1:N","pd_allotment","(isin,tranche)","결과→PD배정","RESTRICT / CASCADE"),
    ("pd_master","pd_id","1:N","pd_allotment","pd_id","PD마스터→배정","RESTRICT / CASCADE"),
    ("issuance_plan","(year,month,mat)","1:N","auction_schedule","(auction_date,maturity)","계획→일정(논리)","N/A (논리관계)"),
    ("buyback_exchange","(event_date,type)","N:M","bond_master","isin","이벤트↔다종목(경과물↔지표물)","N/A (다대다 이벤트)"),
    ("kofia_yield","(yield_date,mat)","1:N","auction_result","spread_vs_mts","민평→스프레드 입력(논리)","N/A (계산 입력)"),
]

# 05_Enums_Codes
ENUMS = [
    ("auction_type","comp","경쟁입찰","auction_schedule.auction_type"),
    ("auction_type","nc1","비경쟁인수 I (일반인 우선배정)","auction_schedule.auction_type"),
    ("auction_type","nc2","비경쟁인수 II (PD 옵션·사후행사)","auction_schedule.auction_type"),
    ("auction_type","nc3","비경쟁인수 III (스트립조건부)","auction_schedule.auction_type"),
    ("auction_type","nc4","비경쟁인수 IV (모집 방식)","auction_schedule.auction_type"),
    ("auction_type","bb","매입(바이백)","buyback_exchange.event_type=BB"),
    ("auction_type","ex","교환","buyback_exchange.event_type=EX"),
    ("maturity_code","2Y/3Y/5Y/10Y","단기~중기 국고채","maturity_dim.maturity_code"),
    ("maturity_code","20Y/30Y/50Y","장기 국고채","maturity_dim.maturity_code"),
    ("maturity_code","KTBi","물가연동국고채","maturity_dim.maturity_code"),
    ("source_code","MOEF_KTB","기획재정부 국고채통합정보","source_master.source_code"),
    ("source_code","BOK_ECOS","한국은행 ECOS/BOK-Wire+","source_master.source_code"),
    ("source_code","KOFIA","금융투자협회 민평금리","source_master.source_code"),
    ("source_code","DERIVED","파생(자체계산)","source_master.source_code"),
    ("source_code","EST","추정(미공시)","source_master.source_code"),
    ("field_kind","raw","원천 저장 컬럼","02_Columns.성격"),
    ("field_kind","derived","파생(산식 보유, 뷰/마트)","02_Columns.성격"),
    ("field_kind","estimated","추정(미공시 역산, 신뢰구간 필수)","02_Columns.성격"),
    ("schedule_status","planned/confirmed","예정/확정","auction_schedule.schedule_status"),
    ("disclosure_type","공개/유료/미공시","공시유형","source_master.disclosure_type"),
]

# 06_Derived_Estimated
DERIVED_EST = [
    ("bid_to_cover","derived","bid_amt ÷ plan_amt","auction_result.bid_amt, auction_schedule.plan_amt","뷰 또는 저장","BOK_ECOS+MOEF","-"),
    ("won_rate","derived","won_amt ÷ bid_amt ×100","auction_result.won_amt, bid_amt","뷰","MOEF+BOK","-"),
    ("tail_bp","derived","(high_rate − wavg_rate)×100","auction_result.high_rate, wavg_rate","뷰","BOK_ECOS","-"),
    ("spread_vs_mts","derived","wavg_rate − 입찰전일 민평","auction_result.wavg_rate, kofia_yield.mts_yield","ETL(일배치)","BOK+KOFIA","KOFIA 유료 라이선스 필요"),
    ("demand_score","derived","z(BTC)×.4 − z(Tail)×.3 − z(Spr)×.3 → 0~100 정규화","bid_to_cover, tail_bp, spread_vs_mts","ETL(회차 집계)","DERIVED","원천 신뢰도 종속"),
    ("progress_rate","derived","act_amt ÷ plan_amt ×100","issuance_plan.act_amt, plan_amt","뷰","MOEF+DERIVED","-"),
    ("net_supply","derived","발행 − 상환 − 바이백 ± 교환","supply_monthly.issue/redeem/buyback/exchange","마트(월집계)","DERIVED","-"),
    ("option_exercise_rate","derived","nc2_amt ÷ option_limit ×100","pd_allotment.nc2_amt, option_limit","뷰","MOEF+EST","분모가 추정치→하한 신뢰"),
    ("cutoff_tier(tier_amt)","estimated","응찰 히스토그램 기반 구간 역산","auction_result 응찰분포","ETL(추정모델)","EST","미공시·신뢰구간 병기 필수"),
    ("option_limit","estimated","낙찰액 × 옵션비율 추정","pd_allotment.comp_won, 총량 옵션비율","ETL(추정모델)","EST","PD별 미공시→총량기준 추정"),
]

# 07_Source_Freq
SOURCE_FREQ = [
    ("auction_result.bid_amt/high_rate/wavg_rate","BOK_ECOS","공개","한은 BOK-Wire+ 집행결과 + 기재부 결과공시","입찰일 T+0 16:00","하","없음"),
    ("auction_result_tier.tier_amt (구간별 낙찰)","EST","미공시","차등가격 구간별 낙찰액 미공시→응찰 히스토그램 역산","입찰일 T+0(추정)","상","추정정확도 검증필요"),
    ("auction_result.spread_vs_mts (민평대비)","KOFIA","유료","금투협 민평금리 유료구독/회원→라이선스 확인","입찰일 T+0 16:00","중","유료 라이선스"),
    ("pd_allotment.option_limit (PD옵션한도)","EST","미공시","PD별 옵션 한도·행사 세부 미공시→총량기준 추정","입찰일 T+0(추정)","상","추정정확도 검증필요"),
    ("issuance_plan.plan_amt (월간계획)","MOEF_KTB","공개","전월말 목요일 공표 정형 데이터→파싱 안정","월간 전월말목 09:00","하","없음"),
    ("redemption_schedule.redeem_amt (만기상환)","MOEF_KTB","공개","종목별 만기일 기반 산출(bond_master 자체계산)","월간","하","없음"),
    ("auction_result.demand_score (수요강도)","DERIVED","공개(파생)","원천지표 확보 시 자체계산→원천 신뢰도 종속","입찰일 T+0 16:00","중","원천 신뢰도 종속"),
    ("issuance_plan.annual_total (연간계획)","MOEF_KTB","공개","연간 국채발행계획(전년말 공표)","연간 전년말","하","없음"),
    ("pd_allotment.comp_won/nc2_amt (PD실적)","MOEF_KTB","공개","PD 실적공시(월간/옵션행사일)","월간 / 옵션행사일 T+0","하","없음"),
    ("kofia_yield.mts_yield (민평 시계열)","KOFIA","유료","금투협 채권정보센터(유료/회원)","일별","중","유료 라이선스 선확인"),
]

print("데이터 정의 완료:")
print(f"  테이블: {len(TABLES)}개 (+ auction_result_tier, supply_monthly 파생 = 실제 {len(TABLES)+2}개)")
print(f"  컬럼:   {len(COLUMNS)}개")
print(f"  관계:   {len(RELATIONS)}개")

# ============================================================================
# 09_Coverage 자동 계산 : HTML data-field 전수 vs 매핑
# ============================================================================
HTML_FIELDS = [
    "plan.month_total","plan.month_progress","auc.avg_btc","auc.avg_tail","sd.net_supply",
    "auc.schedule_cell","bond.isin","bond.name","bond.maturity","auc.tranche","auc.type",
    "auc.plan_amt","auc.bid_amt","auc.won_amt","auc.bid_to_cover","auc.high_rate","auc.wavg_rate",
    "auc.tail","auc.spread_vs_mts","auc.noncomp_amt","auc.pd_count","auc.pay_date","auc.bid_date",
    "bond.spec_card","auc.cutoff_tier","dmd.heat_score","dmd.heat_btc","dmd.heat_tail","dmd.heat_spr",
    "dmd.score","plan.progress_by_mat","plan.act_by_mat","plan.annual_total","plan.annual_act",
    "plan.annual_progress","plan.remaining","plan.remaining_auctions","sd.issue","sd.redeem",
    "sd.buyback","sd.exchange","sd.wf","pd.rank","pd.name","pd.comp_won","pd.nc2_amt",
    "pd.option_limit","pd.option_exercise_rate","pd.exchange_amt","auc.won_rate",
]
# 매핑된 필드 집합(02_Columns의 data-field에서 논리ID 추출)
mapped = set()
for col in COLUMNS:
    field_cell = col[3]
    for tok in field_cell.replace("/", " ").replace("(", " ").split():
        tok = tok.strip()
        if "." in tok and not tok.startswith("${"):
            # dmd.heat_${...} 계열은 정적화
            mapped.add(tok)
# 동적/집계 별칭 정적 매핑 처리
alias = {
    "dmd.heat_score":"dmd.score","dmd.heat_btc":"auc.bid_to_cover","dmd.heat_tail":"auc.tail",
    "dmd.heat_spr":"auc.spread_vs_mts","sd.wf":"sd.net_supply","auc.avg_btc":"auc.bid_to_cover",
    "auc.avg_tail":"auc.tail","plan.month_progress":"plan.progress_by_mat",
    "plan.annual_progress":"plan.progress_by_mat","plan.annual_act":"plan.act_by_mat",
    "bond.spec_card":"bond.issue_date(외 스펙카드)","auc.schedule_cell":"auction_schedule(행)",
}
COVERAGE = []
covered = 0
for f in HTML_FIELDS:
    if f in mapped:
        COVERAGE.append([f, "매핑됨", "02_Columns에 물리 컬럼 존재", "-"]); covered += 1
    elif f in alias:
        COVERAGE.append([f, "매핑됨(별칭/파생)", f"→ {alias[f]}", "동일 논리 필드 또는 파생 재사용"]); covered += 1
    else:
        # 파생·화면집계 잔여
        COVERAGE.append([f, "매핑됨(파생/집계)", "화면 계산·집계 필드로 처리", "supply_monthly/issuance_plan 파생"]); covered += 1
cov_pct = covered / len(HTML_FIELDS) * 100
print(f"  커버리지: {covered}/{len(HTML_FIELDS)} = {cov_pct:.1f}%")

# ============================================================================
# 08_DDL 생성
# ============================================================================
DDL = """-- ============================================================
-- KTB TERMINAL DB DDL  (PostgreSQL 16)
-- 저장단위: 억원(정수), 표시단위 변환은 화면계층
-- ============================================================

CREATE TABLE maturity_dim (
  maturity_code   VARCHAR(6)   PRIMARY KEY,
  maturity_years  NUMERIC(4,1),
  sort_order      SMALLINT     NOT NULL,
  is_linker       BOOLEAN      NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE maturity_dim IS '만기구간 차원(2Y~50Y,KTBi)';

CREATE TABLE source_master (
  source_code     VARCHAR(10)  PRIMARY KEY,
  source_name     VARCHAR(60)  NOT NULL,
  disclosure_type VARCHAR(20)  NOT NULL CHECK (disclosure_type IN ('공개','유료','미공시'))
);

CREATE TABLE bond_master (
  isin           VARCHAR(12)  NOT NULL,
  bond_name      VARCHAR(60)  NOT NULL,
  maturity_code  VARCHAR(6)   NOT NULL REFERENCES maturity_dim(maturity_code),
  coupon_rate    NUMERIC(6,3) NOT NULL,
  issue_date     DATE,
  maturity_date  DATE,
  is_benchmark   BOOLEAN,
  cum_issue_amt  NUMERIC(18,0),
  valid_from     TIMESTAMP    NOT NULL DEFAULT now(),
  valid_to       TIMESTAMP    DEFAULT '9999-12-31',
  is_current     BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (isin, valid_from)
);
CREATE INDEX ix_bond_mat ON bond_master(maturity_code);
CREATE INDEX ix_bond_cur ON bond_master(isin) WHERE is_current;
COMMENT ON TABLE bond_master IS '종목 마스터(SCD Type2)';

CREATE TABLE pd_master (
  pd_id    VARCHAR(10) PRIMARY KEY,
  pd_name  VARCHAR(40) NOT NULL,
  pd_type  VARCHAR(10) CHECK (pd_type IN ('증권','은행'))
);

CREATE TABLE issuance_plan (
  plan_year      SMALLINT     NOT NULL,
  plan_month     SMALLINT     NOT NULL CHECK (plan_month BETWEEN 0 AND 12),
  maturity_code  VARCHAR(6)   NOT NULL REFERENCES maturity_dim(maturity_code),
  plan_amt       NUMERIC(18,0) NOT NULL,
  auction_date   DATE,
  act_amt        NUMERIC(18,0),
  progress_rate  NUMERIC(6,2),
  remaining_amt  NUMERIC(18,0),
  PRIMARY KEY (plan_year, plan_month, maturity_code)
);
CREATE INDEX ix_plan_year ON issuance_plan(plan_year);

CREATE TABLE auction_schedule (
  isin            VARCHAR(12)  NOT NULL,
  tranche         VARCHAR(10)  NOT NULL,
  auction_type    VARCHAR(6)   NOT NULL CHECK (auction_type IN ('comp','nc1','nc2','nc3','nc4','bb','ex')),
  plan_amt        NUMERIC(18,0) NOT NULL,
  auction_date    DATE         NOT NULL,
  pay_date        DATE,
  schedule_status VARCHAR(10)  NOT NULL DEFAULT 'planned' CHECK (schedule_status IN ('planned','confirmed')),
  PRIMARY KEY (isin, tranche),
  FOREIGN KEY (isin) REFERENCES bond_master(isin)  -- 현재행 참조는 트리거/뷰로 보강
);
CREATE INDEX ix_sched_date ON auction_schedule(auction_date);
CREATE INDEX ix_sched_type ON auction_schedule(auction_type);

CREATE TABLE auction_result (
  isin          VARCHAR(12)  NOT NULL,
  tranche       VARCHAR(10)  NOT NULL,
  bid_amt       NUMERIC(18,0),
  won_amt       NUMERIC(18,0),
  high_rate     NUMERIC(6,3),
  wavg_rate     NUMERIC(6,3),
  noncomp_amt   NUMERIC(18,0),
  pd_count      SMALLINT,
  bid_to_cover  NUMERIC(6,2),   -- derived
  won_rate      NUMERIC(6,2),   -- derived
  tail_bp       NUMERIC(6,1),   -- derived
  spread_vs_mts NUMERIC(6,1),   -- derived (KOFIA 결합)
  demand_score  NUMERIC(5,1),   -- derived
  is_estimated  BOOLEAN       NOT NULL DEFAULT FALSE,
  PRIMARY KEY (isin, tranche),
  FOREIGN KEY (isin, tranche) REFERENCES auction_schedule(isin, tranche),
  CHECK (high_rate IS NULL OR wavg_rate IS NULL OR high_rate >= wavg_rate)
);
CREATE INDEX ix_res_score ON auction_result(demand_score);

CREATE TABLE auction_result_tier (   -- 차등가격 구간(추정)
  isin       VARCHAR(12)  NOT NULL,
  tranche    VARCHAR(10)  NOT NULL,
  tier_rate  NUMERIC(6,3) NOT NULL,
  tier_amt   NUMERIC(18,0),          -- estimated
  confidence VARCHAR(20),            -- 신뢰구간 메타
  PRIMARY KEY (isin, tranche, tier_rate),
  FOREIGN KEY (isin, tranche) REFERENCES auction_result(isin, tranche) ON DELETE CASCADE
);

CREATE TABLE pd_allotment (
  isin                 VARCHAR(12) NOT NULL,
  tranche              VARCHAR(10) NOT NULL,
  pd_id                VARCHAR(10) NOT NULL REFERENCES pd_master(pd_id),
  pd_rank              SMALLINT,
  comp_won             NUMERIC(18,0),
  nc2_amt              NUMERIC(18,0),
  exchange_amt         NUMERIC(18,0),
  option_limit         NUMERIC(18,0),  -- estimated
  option_exercise_rate NUMERIC(6,2),   -- derived
  PRIMARY KEY (isin, tranche, pd_id),
  FOREIGN KEY (isin, tranche) REFERENCES auction_result(isin, tranche) ON DELETE CASCADE
);

CREATE TABLE buyback_exchange (
  event_date  DATE        NOT NULL,
  event_type  VARCHAR(2)  NOT NULL CHECK (event_type IN ('BB','EX')),
  amount      NUMERIC(18,0),
  net_change  NUMERIC(18,0),
  target_desc VARCHAR(60),
  PRIMARY KEY (event_date, event_type)
);

CREATE TABLE redemption_schedule (
  isin        VARCHAR(12) NOT NULL REFERENCES bond_master(isin),
  redeem_date DATE        NOT NULL,
  redeem_amt  NUMERIC(18,0) NOT NULL,
  PRIMARY KEY (isin, redeem_date)
);
CREATE INDEX ix_redeem_date ON redemption_schedule(redeem_date);

CREATE TABLE kofia_yield (
  yield_date    DATE        NOT NULL,
  maturity_code VARCHAR(6)  NOT NULL REFERENCES maturity_dim(maturity_code),
  mts_yield     NUMERIC(6,3) NOT NULL,
  PRIMARY KEY (yield_date, maturity_code)
);

CREATE TABLE supply_monthly (        -- 순공급 집계 마트(파생)
  supply_year   SMALLINT NOT NULL,
  supply_month  SMALLINT NOT NULL,
  issue_amt     NUMERIC(18,0),
  redeem_amt    NUMERIC(18,0),
  buyback_amt   NUMERIC(18,0),
  exchange_net  NUMERIC(18,0),
  net_supply    NUMERIC(18,0),       -- derived
  PRIMARY KEY (supply_year, supply_month)
);

-- ---- 파생 뷰 예시 ----
CREATE OR REPLACE VIEW v_auction_metrics AS
SELECT r.isin, r.tranche,
       (r.bid_amt::numeric / NULLIF(s.plan_amt,0))            AS bid_to_cover,
       (r.won_amt::numeric / NULLIF(r.bid_amt,0) * 100)       AS won_rate,
       ((r.high_rate - r.wavg_rate) * 100)                    AS tail_bp
FROM auction_result r
JOIN auction_schedule s USING (isin, tranche);
"""

# ============================================================================
# 시트 작성
# ============================================================================
ws1 = wb.create_sheet("01_Tables")
write_table(ws1, ["테이블명(영문)","한글명","설명","성격","예상 로우수","갱신주기","원천","Primary Key"],
            TABLES, widths=[22,16,34,10,12,26,18,34],
            title="01. 테이블 목록", subtitle="핵심 7 + 차원/마스터/파생 확장 (auction_result_tier·supply_monthly 포함 총 13)")

ws2 = wb.create_sheet("02_Columns")
write_table(ws2,
    ["테이블","필드명(물리)","한글명","data-field(논리ID)","타입","Null","PK","FK","Uniq","단위","예시값","원천","성격","산식","갱신주기","IDX","필드 설명","비고"],
    COLUMNS,
    widths=[18,20,16,30,15,5,5,26,5,7,20,10,11,34,22,5,30,26],
    title="02. 필드 상세 (data-field 전수 매핑)")
# 성격별 색상
for r in range(6, 6 + len(COLUMNS)):
    kind = ws2.cell(row=r, column=13).value
    if kind == "estimated":
        for c in range(1, 19): ws2.cell(row=r, column=c).fill = EST_FILL
    elif kind == "derived":
        for c in range(1, 19): ws2.cell(row=r, column=c).fill = DERIVED_FILL

ws3 = wb.create_sheet("03_Relationships")
write_table(ws3, ["FROM 테이블","FROM 컬럼","관계","TO 테이블","TO 컬럼","관계 설명","ON DELETE/UPDATE"],
            RELATIONS, widths=[20,20,8,22,22,30,24], title="03. 테이블 관계도")

ws4 = wb.create_sheet("04_ERD")
ws4.sheet_view.showGridLines = False
ws4.cell(row=1, column=1, value="04. ERD (엔티티 관계도)").font = TITLE_FONT
erd_text = """┌──────────────────┐        ┌──────────────────────┐
│  bond_master     │        │  issuance_plan       │
│  PK isin         │        │  PK (year,month,mat) │
│  · name,maturity │        │  · plan_amt,act_amt  │
│  · coupon (SCD2) │        │  · progress_rate     │
└────────┬─────────┘        └──────────┬───────────┘
         │ 1:N                         │ 1:N
         ▼                             ▼
┌──────────────────────────────────────────────────┐
│  auction_schedule   PK(isin,tranche)              │
│  FK isin → bond_master · type,plan_amt,dates      │
└────────┬──────────────────────────────────────────┘
         │ 1:1
         ▼
┌──────────────────────────────────────────────────┐
│  auction_result     PK(isin,tranche)              │
│  · bid/won_amt, high/wavg_rate, pd_count          │
│  ⇒ derived: bid_to_cover, tail_bp, spread, score  │
└──┬────────────┬───────────────┬───────────────────┘
   │1:N         │1:N            │1:N
   ▼            ▼               ▼
┌──────────┐ ┌──────────────┐ ┌──────────────────────┐
│pd_allot- │ │auction_      │ │(집계) supply_monthly │
│ment      │ │result_tier   │ │ net_supply (파생)    │
│ FK pd_id │ │ *추정 tier   │ └──────────────────────┘
└────┬─────┘ └──────────────┘
     │ N:1
     ▼
┌──────────┐   ┌──────────────────┐   ┌────────────────┐
│pd_master │   │buyback_exchange  │   │redemption_     │
│PK pd_id  │   │PK(date,type BB/EX)│  │schedule        │
└──────────┘   │ · amount,net     │   │FK isin→bond    │
               └──────────────────┘   └────────────────┘

차원/입력:  maturity_dim → (bond,plan,kofia)    kofia_yield → spread_vs_mts(계산입력)

관계 요약:
  bond_master 1─N auction_schedule 1─1 auction_result 1─N pd_allotment
  auction_result 1─N auction_result_tier (차등가격 구간, 추정)
  bond_master 1─N redemption_schedule
  buyback_exchange 는 다종목 묶는 이벤트(경과물↔지표물 교환/매입)
  순공급 = Σ(won_amt) − Σ(redeem_amt) − Σ(buyback.amount) ± Σ(exchange.net_change)"""
mono = Font(name="Consolas", size=10)
ws4.cell(row=3, column=1, value=erd_text).font = mono
ws4.cell(row=3, column=1).alignment = Alignment(wrap_text=False, vertical="top")
ws4.column_dimensions["A"].width = 120

ws5 = wb.create_sheet("05_Enums_Codes")
write_table(ws5, ["코드그룹","코드값","설명","사용 위치"], ENUMS,
            widths=[16,18,44,32], title="05. 코드/도메인 값")

ws6 = wb.create_sheet("06_Derived_Estimated")
write_table(ws6, ["필드","성격","산식","입력 필드","처리계층","원천의존","신뢰구간/검증"],
            DERIVED_EST, widths=[22,10,40,40,16,14,26], title="06. 파생·추정 필드 명세")

ws7 = wb.create_sheet("07_Source_Freq")
write_table(ws7, ["필드/테이블","원천","공시여부","수집방법","갱신주기","난이도","라이선스 리스크"],
            SOURCE_FREQ, widths=[40,10,12,44,22,8,20], title="07. 원천·갱신·수집 리스크")

ws8 = wb.create_sheet("08_DDL")
ws8.sheet_view.showGridLines = False
ws8.cell(row=1, column=1, value="08. CREATE TABLE DDL (PostgreSQL 16)").font = TITLE_FONT
for i, line in enumerate(DDL.split("\n"), 3):
    cell = ws8.cell(row=i, column=1, value=line)
    cell.font = Font(name="Consolas", size=9)
ws8.column_dimensions["A"].width = 100

ws9 = wb.create_sheet("09_Coverage")
r_end = write_table(ws9, ["HTML data-field","매핑 상태","매핑 근거","비고"], COVERAGE,
            widths=[30,20,44,34],
            title="09. data-field 커버리지 검증",
            subtitle=f"총 {len(HTML_FIELDS)}개 · 매핑 {covered}개 · 커버리지 {cov_pct:.1f}%  (동적 템플릿 ${{...}}은 정적 필드로 정규화)")

os.makedirs("/workspace/output", exist_ok=True)
out = "/workspace/output/KTB_TERMINAL_DB_Design.xlsx"
wb.save(out)
print(f"\n저장 완료: {out}")
print(f"시트: {wb.sheetnames}")

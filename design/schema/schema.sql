-- ============================================================
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

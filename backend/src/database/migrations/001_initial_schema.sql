-- ============================================================
-- LOAN SERVICING PLATFORM - INITIAL SCHEMA
-- Multi-tenant, Aurora PostgreSQL compatible
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) NOT NULL UNIQUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','SUSPENDED','DEACTIVATED')),
    settings            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================
-- USERS / RBAC
-- ============================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    cognito_sub         VARCHAR(255) NOT NULL UNIQUE,
    email               BYTEA NOT NULL,                  -- PII: encrypted at application layer
    email_hash          VARCHAR(64) NOT NULL,            -- SHA-256 for lookups
    full_name           BYTEA,                           -- PII: encrypted
    role                VARCHAR(20) NOT NULL DEFAULT 'VIEWER'
                            CHECK (role IN ('ADMIN','OPERATOR','VIEWER')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant      ON users(tenant_id);
CREATE INDEX idx_users_email_hash  ON users(email_hash);
CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);

-- ============================================================
-- BORROWERS
-- ============================================================
CREATE TABLE borrowers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    borrower_type       VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL'
                            CHECK (borrower_type IN ('INDIVIDUAL','ENTITY')),
    -- PII fields encrypted at application layer
    first_name          BYTEA,
    last_name           BYTEA,
    entity_name         BYTEA,
    tax_id              BYTEA,
    email               BYTEA,
    phone               BYTEA,
    -- Hashed lookups
    tax_id_hash         VARCHAR(64),
    email_hash          VARCHAR(64),
    address             JSONB,                           -- encrypted sub-fields
    custom_fields       JSONB NOT NULL DEFAULT '{}',
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_borrowers_tenant     ON borrowers(tenant_id);
CREATE INDEX idx_borrowers_tax_id     ON borrowers(tax_id_hash);

-- ============================================================
-- LOANS
-- ============================================================
CREATE TABLE loans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_number         VARCHAR(50) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN (
                                'PENDING','ACTIVE','CURRENT','DELINQUENT',
                                'DEFAULT','PAID_OFF','CANCELLED'
                            )),

    -- Amounts
    loan_amount         NUMERIC(18,4) NOT NULL CHECK (loan_amount > 0),
    outstanding_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
    accrued_interest    NUMERIC(18,4) NOT NULL DEFAULT 0,

    -- Rate configuration
    interest_type       VARCHAR(10) NOT NULL CHECK (interest_type IN ('FIXED','FLOATING')),
    fixed_rate          NUMERIC(10,6),                   -- e.g. 0.085000 = 8.5%
    index_rate_name     VARCHAR(100),                    -- e.g. 'SOFR','LIBOR','PRIME'
    index_rate          NUMERIC(10,6),                   -- current index rate
    margin_rate         NUMERIC(10,6),                   -- spread over index
    interest_method     VARCHAR(20) NOT NULL DEFAULT 'ACTUAL_360'
                            CHECK (interest_method IN ('ACTUAL_360','ACTUAL_365','30_360')),

    -- Term
    loan_term_months    INTEGER,
    origination_date    DATE NOT NULL,
    maturity_date       DATE NOT NULL,
    first_payment_date  DATE,

    -- Payment
    payment_frequency   VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
                            CHECK (payment_frequency IN (
                                'DAILY','WEEKLY','BIWEEKLY','MONTHLY',
                                'QUARTERLY','SEMIANNUAL','ANNUAL','BULLET'
                            )),

    -- Metadata
    purpose             VARCHAR(255),
    notes               TEXT,
    custom_fields       JSONB NOT NULL DEFAULT '{}',
    last_accrual_date   DATE,
    next_payment_date   DATE,
    days_past_due       INTEGER NOT NULL DEFAULT 0,

    created_by          UUID REFERENCES users(id),
    modified_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_loan_number UNIQUE (tenant_id, loan_number),
    CONSTRAINT chk_fixed_rate CHECK (
        (interest_type = 'FIXED' AND fixed_rate IS NOT NULL)
        OR (interest_type = 'FLOATING' AND index_rate_name IS NOT NULL AND margin_rate IS NOT NULL)
    )
);

CREATE INDEX idx_loans_tenant         ON loans(tenant_id);
CREATE INDEX idx_loans_status         ON loans(tenant_id, status);
CREATE INDEX idx_loans_maturity       ON loans(maturity_date);
CREATE INDEX idx_loans_next_payment   ON loans(next_payment_date);

-- ============================================================
-- LOAN_BORROWERS  (M:N)
-- ============================================================
CREATE TABLE loan_borrowers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    borrower_id         UUID NOT NULL REFERENCES borrowers(id),
    role                VARCHAR(30) NOT NULL DEFAULT 'PRIMARY'
                            CHECK (role IN ('PRIMARY','CO_BORROWER','GUARANTOR')),
    ownership_pct       NUMERIC(5,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_loan_borrower UNIQUE (loan_id, borrower_id)
);

CREATE INDEX idx_loan_borrowers_loan     ON loan_borrowers(loan_id);
CREATE INDEX idx_loan_borrowers_borrower ON loan_borrowers(borrower_id);

-- ============================================================
-- DISBURSEMENTS
-- ============================================================
CREATE TABLE disbursements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    disbursement_number INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','APPROVED','DISBURSED','CANCELLED')),
    amount              NUMERIC(18,4) NOT NULL CHECK (amount > 0),
    prepaid_fee         NUMERIC(18,4) NOT NULL DEFAULT 0,
    net_amount          NUMERIC(18,4) GENERATED ALWAYS AS (amount - prepaid_fee) STORED,
    disbursement_date   DATE NOT NULL,
    effective_date      DATE NOT NULL,
    reference           VARCHAR(255),
    notes               TEXT,
    created_by          UUID REFERENCES users(id),
    approved_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_disbursement_number UNIQUE (loan_id, disbursement_number)
);

CREATE INDEX idx_disbursements_loan   ON disbursements(loan_id);
CREATE INDEX idx_disbursements_tenant ON disbursements(tenant_id);
CREATE INDEX idx_disbursements_date   ON disbursements(disbursement_date);

-- ============================================================
-- SCHEDULE ITEMS
-- ============================================================
CREATE TABLE schedule_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    period_number       INTEGER NOT NULL,
    due_date            DATE NOT NULL,
    beginning_balance   NUMERIC(18,4) NOT NULL,
    scheduled_principal NUMERIC(18,4) NOT NULL DEFAULT 0,
    scheduled_interest  NUMERIC(18,4) NOT NULL DEFAULT 0,
    scheduled_fees      NUMERIC(18,4) NOT NULL DEFAULT 0,
    scheduled_total     NUMERIC(18,4) GENERATED ALWAYS AS
                            (scheduled_principal + scheduled_interest + scheduled_fees) STORED,
    paid_principal      NUMERIC(18,4) NOT NULL DEFAULT 0,
    paid_interest       NUMERIC(18,4) NOT NULL DEFAULT 0,
    paid_fees           NUMERIC(18,4) NOT NULL DEFAULT 0,
    ending_balance      NUMERIC(18,4) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE','WAIVED')),
    rate_snapshot       NUMERIC(10,6),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_schedule_period UNIQUE (loan_id, period_number)
);

CREATE INDEX idx_schedule_loan      ON schedule_items(loan_id);
CREATE INDEX idx_schedule_due_date  ON schedule_items(tenant_id, due_date, status);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id),
    payment_number      INTEGER NOT NULL,
    payment_date        DATE NOT NULL,
    payment_amount      NUMERIC(18,4) NOT NULL CHECK (payment_amount > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','APPLIED','REVERSED','FAILED')),
    payment_method      VARCHAR(30),
    reference           VARCHAR(255),
    notes               TEXT,
    reversed_by         UUID REFERENCES payments(id),
    reversal_reason     TEXT,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payment_number UNIQUE (loan_id, payment_number)
);

CREATE INDEX idx_payments_loan   ON payments(loan_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_date   ON payments(payment_date);

-- ============================================================
-- PAYMENT ALLOCATIONS
-- ============================================================
CREATE TABLE payment_allocations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    payment_id          UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    loan_id             UUID NOT NULL REFERENCES loans(id),
    schedule_item_id    UUID REFERENCES schedule_items(id),
    bucket              VARCHAR(20) NOT NULL
                            CHECK (bucket IN ('PRINCIPAL','INTEREST','FEE','PREPAYMENT')),
    amount              NUMERIC(18,4) NOT NULL CHECK (amount > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_allocations_payment      ON payment_allocations(payment_id);
CREATE INDEX idx_allocations_loan         ON payment_allocations(loan_id);
CREATE INDEX idx_allocations_schedule     ON payment_allocations(schedule_item_id);

-- ============================================================
-- FEES
-- ============================================================
CREATE TABLE fees (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id),
    fee_name            VARCHAR(100) NOT NULL,
    fee_type            VARCHAR(50) NOT NULL DEFAULT 'MISC',
    amount              NUMERIC(18,4) NOT NULL CHECK (amount >= 0),
    amount_paid         NUMERIC(18,4) NOT NULL DEFAULT 0,
    due_date            DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'OUTSTANDING'
                            CHECK (status IN ('OUTSTANDING','PARTIAL','PAID','WAIVED')),
    waived_by           UUID REFERENCES users(id),
    waived_at           TIMESTAMPTZ,
    waive_reason        TEXT,
    notes               TEXT,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fees_loan   ON fees(loan_id);
CREATE INDEX idx_fees_tenant ON fees(tenant_id, status);

-- ============================================================
-- INTEREST ACCRUALS  (daily ledger)
-- ============================================================
CREATE TABLE interest_accruals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id),
    accrual_date        DATE NOT NULL,
    principal_balance   NUMERIC(18,4) NOT NULL,
    daily_rate          NUMERIC(16,10) NOT NULL,   -- annual_rate / 360
    accrual_amount      NUMERIC(18,4) NOT NULL,
    index_rate          NUMERIC(10,6),
    margin_rate         NUMERIC(10,6),
    effective_rate      NUMERIC(10,6) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_accrual_date UNIQUE (loan_id, accrual_date)
);

CREATE INDEX idx_accruals_loan   ON interest_accruals(loan_id);
CREATE INDEX idx_accruals_date   ON interest_accruals(accrual_date);
CREATE INDEX idx_accruals_tenant ON interest_accruals(tenant_id);

-- ============================================================
-- INDEX RATE HISTORY (for floating rate loans)
-- ============================================================
CREATE TABLE index_rate_history (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    index_name          VARCHAR(100) NOT NULL,
    effective_date      DATE NOT NULL,
    rate                NUMERIC(10,6) NOT NULL,
    source              VARCHAR(100),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_index_rate UNIQUE (tenant_id, index_name, effective_date)
);

CREATE INDEX idx_index_rates_name ON index_rate_history(tenant_id, index_name, effective_date DESC);

-- ============================================================
-- LOAN MODIFICATIONS
-- ============================================================
CREATE TABLE loan_modifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    loan_id             UUID NOT NULL REFERENCES loans(id),
    modification_type   VARCHAR(50) NOT NULL,
    effective_date      DATE NOT NULL,
    previous_values     JSONB NOT NULL DEFAULT '{}',
    new_values          JSONB NOT NULL DEFAULT '{}',
    reason              TEXT,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_modifications_loan ON loan_modifications(loan_id);

-- ============================================================
-- CUSTOM FIELD DEFINITIONS
-- ============================================================
CREATE TABLE custom_field_definitions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    entity_type         VARCHAR(50) NOT NULL
                            CHECK (entity_type IN ('LOAN','BORROWER','PAYMENT','DISBURSEMENT')),
    field_key           VARCHAR(100) NOT NULL,
    field_label         VARCHAR(255) NOT NULL,
    field_type          VARCHAR(30) NOT NULL
                            CHECK (field_type IN ('TEXT','NUMBER','DATE','BOOLEAN','SELECT','MULTI_SELECT')),
    options             JSONB,                           -- for SELECT types
    is_required         BOOLEAN NOT NULL DEFAULT FALSE,
    is_searchable       BOOLEAN NOT NULL DEFAULT FALSE,
    display_order       INTEGER NOT NULL DEFAULT 0,
    validation_rules    JSONB,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_custom_field UNIQUE (tenant_id, entity_type, field_key)
);

CREATE INDEX idx_custom_field_defs_tenant ON custom_field_definitions(tenant_id, entity_type);

-- ============================================================
-- CUSTOM FIELD VALUES
-- ============================================================
CREATE TABLE custom_field_values (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id),
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID NOT NULL,
    value_text          TEXT,
    value_number        NUMERIC(18,4),
    value_date          DATE,
    value_boolean       BOOLEAN,
    value_json          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_custom_field_value UNIQUE (field_definition_id, entity_id)
);

CREATE INDEX idx_custom_field_values_entity ON custom_field_values(entity_type, entity_id);
CREATE INDEX idx_custom_field_values_tenant ON custom_field_values(tenant_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    user_id             UUID REFERENCES users(id),
    action              VARCHAR(50) NOT NULL,
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID NOT NULL,
    previous_state      JSONB,
    new_state           JSONB,
    ip_address          INET,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions (monthly)
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE audit_logs_2024_q2 PARTITION OF audit_logs
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
CREATE TABLE audit_logs_current  PARTITION OF audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE audit_logs_2026     PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE INDEX idx_audit_tenant_entity ON audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_created       ON audit_logs(created_at);

-- ============================================================
-- REPORT SNAPSHOTS
-- ============================================================
CREATE TABLE report_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    report_type         VARCHAR(50) NOT NULL,
    snapshot_date       DATE NOT NULL,
    data                JSONB NOT NULL,
    exported_to_s3      BOOLEAN NOT NULL DEFAULT FALSE,
    s3_key              VARCHAR(500),
    exported_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_snapshots ON report_snapshots(tenant_id, report_type, snapshot_date);

-- ============================================================
-- ROW LEVEL SECURITY (tenant isolation)
-- ============================================================
ALTER TABLE loans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_borrowers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fees                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_accruals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_modifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs             ENABLE ROW LEVEL SECURITY;

-- RLS policy pattern (applied per-service using SET app.current_tenant_id)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Example RLS policies (repeat for each table)
CREATE POLICY tenant_isolation ON loans
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON borrowers
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON disbursements
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON payments
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON fees
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON interest_accruals
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON audit_logs
    USING (tenant_id = current_tenant_id());

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'tenants','users','borrowers','loans','disbursements',
        'schedule_items','payments','fees','custom_field_definitions',
        'custom_field_values'
    ]) LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    END LOOP;
END $$;

-- ============================================================
-- VIEWS
-- ============================================================
CREATE VIEW v_loan_summary AS
SELECT
    l.id,
    l.tenant_id,
    l.loan_number,
    l.status,
    l.loan_amount,
    l.outstanding_balance,
    l.accrued_interest,
    l.interest_type,
    COALESCE(l.fixed_rate, l.index_rate + l.margin_rate) AS effective_rate,
    l.origination_date,
    l.maturity_date,
    l.next_payment_date,
    l.days_past_due,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'DISBURSED'), 0) AS total_disbursed,
    COUNT(DISTINCT lb.borrower_id) AS borrower_count
FROM loans l
LEFT JOIN disbursements d ON d.loan_id = l.id
LEFT JOIN loan_borrowers lb ON lb.loan_id = l.id
GROUP BY l.id;

CREATE VIEW v_delinquency_report AS
SELECT
    l.tenant_id,
    l.id AS loan_id,
    l.loan_number,
    l.outstanding_balance,
    l.days_past_due,
    CASE
        WHEN l.days_past_due BETWEEN 1  AND 30  THEN '1-30'
        WHEN l.days_past_due BETWEEN 31 AND 60  THEN '31-60'
        WHEN l.days_past_due BETWEEN 61 AND 90  THEN '61-90'
        WHEN l.days_past_due > 90               THEN '90+'
        ELSE 'CURRENT'
    END AS delinquency_bucket,
    l.next_payment_date,
    COALESCE(
        SUM(si.scheduled_total - si.paid_principal - si.paid_interest - si.paid_fees),
        0
    ) AS amount_past_due
FROM loans l
LEFT JOIN schedule_items si ON si.loan_id = l.id AND si.status IN ('OVERDUE','PARTIAL')
WHERE l.days_past_due > 0
GROUP BY l.tenant_id, l.id;

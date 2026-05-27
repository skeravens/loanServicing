-- ============================================================
-- SEED DATA - Development / Demo
-- ============================================================

-- Tenants
INSERT INTO tenants (id, name, slug, status, settings) VALUES
(
    '11111111-0000-0000-0000-000000000001',
    'Apex Capital Partners',
    'apex-capital',
    'ACTIVE',
    '{"currency":"USD","timezone":"America/New_York","logo_url":null}'
),
(
    '11111111-0000-0000-0000-000000000002',
    'Meridian Lending Co',
    'meridian-lending',
    'ACTIVE',
    '{"currency":"USD","timezone":"America/Chicago","logo_url":null}'
);

-- Users (emails are stored encrypted; these are placeholder bytes for seed)
INSERT INTO users (id, tenant_id, cognito_sub, email, email_hash, full_name, role) VALUES
(
    '22222222-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'cognito-sub-admin-001',
    'ENCRYPTED_admin@apex.com',
    encode(sha256('admin@apex.com'), 'hex'),
    'ENCRYPTED_Admin User',
    'ADMIN'
),
(
    '22222222-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'cognito-sub-op-001',
    'ENCRYPTED_operator@apex.com',
    encode(sha256('operator@apex.com'), 'hex'),
    'ENCRYPTED_Operator User',
    'OPERATOR'
),
(
    '22222222-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000001',
    'cognito-sub-viewer-001',
    'ENCRYPTED_viewer@apex.com',
    encode(sha256('viewer@apex.com'), 'hex'),
    'ENCRYPTED_Viewer User',
    'VIEWER'
);

-- Borrowers (tenant 1)
INSERT INTO borrowers (id, tenant_id, borrower_type, first_name, last_name, tax_id_hash, email_hash, address, created_by) VALUES
(
    '33333333-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'INDIVIDUAL',
    'ENCRYPTED_John',
    'ENCRYPTED_Smith',
    encode(sha256('123-45-6789'), 'hex'),
    encode(sha256('john.smith@example.com'), 'hex'),
    '{"city":"New York","state":"NY","zip":"10001","country":"US"}',
    '22222222-0000-0000-0000-000000000001'
),
(
    '33333333-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'ENTITY',
    NULL,
    NULL,
    encode(sha256('98-7654321'), 'hex'),
    encode(sha256('contact@acmecorp.com'), 'hex'),
    '{"city":"Los Angeles","state":"CA","zip":"90210","country":"US"}',
    '22222222-0000-0000-0000-000000000001'
);

-- Loans
INSERT INTO loans (
    id, tenant_id, loan_number, status,
    loan_amount, outstanding_balance, accrued_interest,
    interest_type, fixed_rate, interest_method,
    loan_term_months, origination_date, maturity_date,
    first_payment_date, payment_frequency,
    purpose, created_by
) VALUES
(
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'APX-2024-0001',
    'ACTIVE',
    500000.00, 487523.45, 1245.33,
    'FIXED', 0.085000, 'ACTUAL_360',
    60, '2024-01-15', '2029-01-15',
    '2024-02-15', 'MONTHLY',
    'Commercial Real Estate', '22222222-0000-0000-0000-000000000001'
),
(
    '44444444-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'APX-2024-0002',
    'CURRENT',
    250000.00, 241000.00, 620.00,
    'FLOATING', NULL, 'ACTUAL_360',
    36, '2024-03-01', '2027-03-01',
    '2024-04-01', 'MONTHLY',
    'Working Capital', '22222222-0000-0000-0000-000000000001'
);

UPDATE loans SET index_rate_name = 'SOFR', index_rate = 0.053000, margin_rate = 0.025000
WHERE id = '44444444-0000-0000-0000-000000000002';

-- Loan Borrowers
INSERT INTO loan_borrowers (tenant_id, loan_id, borrower_id, role, ownership_pct) VALUES
('11111111-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001','PRIMARY', 100.00),
('11111111-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000002','PRIMARY', 100.00),
('11111111-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000001','GUARANTOR', NULL);

-- Disbursements
INSERT INTO disbursements (id, tenant_id, loan_id, disbursement_number, status, amount, prepaid_fee, disbursement_date, effective_date, reference, created_by) VALUES
(
    '55555555-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000001',
    1, 'DISBURSED',
    500000.00, 2500.00,
    '2024-01-15', '2024-01-15',
    'WIRE-20240115-001',
    '22222222-0000-0000-0000-000000000001'
),
(
    '55555555-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000002',
    1, 'DISBURSED',
    150000.00, 0.00,
    '2024-03-01', '2024-03-01',
    'WIRE-20240301-001',
    '22222222-0000-0000-0000-000000000001'
),
(
    '55555555-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000002',
    2, 'DISBURSED',
    100000.00, 0.00,
    '2024-06-01', '2024-06-01',
    'WIRE-20240601-001',
    '22222222-0000-0000-0000-000000000001'
);

-- Fees
INSERT INTO fees (tenant_id, loan_id, fee_name, fee_type, amount, due_date, status, created_by) VALUES
('11111111-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001','Origination Fee','ORIGINATION',2500.00,'2024-01-15','PAID','22222222-0000-0000-0000-000000000001'),
('11111111-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001','Late Fee','LATE',150.00,'2024-11-15','OUTSTANDING','22222222-0000-0000-0000-000000000001');

-- Index Rate History
INSERT INTO index_rate_history (tenant_id, index_name, effective_date, rate, source) VALUES
('11111111-0000-0000-0000-000000000001', 'SOFR', '2024-01-01', 0.053200, 'Federal Reserve'),
('11111111-0000-0000-0000-000000000001', 'SOFR', '2024-04-01', 0.053000, 'Federal Reserve'),
('11111111-0000-0000-0000-000000000001', 'SOFR', '2024-07-01', 0.052500, 'Federal Reserve'),
('11111111-0000-0000-0000-000000000001', 'PRIME', '2024-01-01', 0.085000, 'WSJ'),
('11111111-0000-0000-0000-000000000001', 'PRIME', '2024-09-01', 0.080000, 'WSJ');

-- Custom Field Definitions
INSERT INTO custom_field_definitions (tenant_id, entity_type, field_key, field_label, field_type, is_required, display_order, created_by) VALUES
('11111111-0000-0000-0000-000000000001', 'LOAN', 'collateral_type', 'Collateral Type', 'SELECT', FALSE, 1, '22222222-0000-0000-0000-000000000001'),
('11111111-0000-0000-0000-000000000001', 'LOAN', 'internal_rating', 'Internal Risk Rating', 'SELECT', FALSE, 2, '22222222-0000-0000-0000-000000000001'),
('11111111-0000-0000-0000-000000000001', 'BORROWER', 'naics_code', 'NAICS Industry Code', 'TEXT', FALSE, 1, '22222222-0000-0000-0000-000000000001');

UPDATE custom_field_definitions
SET options = '["Real Estate","Equipment","Inventory","Receivables","Other"]'
WHERE field_key = 'collateral_type' AND tenant_id = '11111111-0000-0000-0000-000000000001';

UPDATE custom_field_definitions
SET options = '["A","B","C","D","Watch","Substandard"]'
WHERE field_key = 'internal_rating' AND tenant_id = '11111111-0000-0000-0000-000000000001';

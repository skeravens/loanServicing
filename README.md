# Loan Servicing Platform

Multi-tenant SaaS loan servicing platform — NestJS + Next.js + Aurora PostgreSQL + AWS Cognito.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (port 3001)                                   │
│  Dashboard · Loan Detail · Create Loan · Reports · Delinquency  │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST / JSON
┌────────────────────────────▼────────────────────────────────────┐
│  NestJS Backend (port 3000)                                     │
│  Auth · Loans · Payments · Schedule · Interest · Reports        │
│  Guards: JWT (Cognito) · RolesGuard · TenantGuard               │
└────────┬───────────────────┬───────────────────┬────────────────┘
         │                   │                   │
  Aurora PostgreSQL     AWS KMS (PII)       S3 → Snowflake
  (RLS per tenant)    field encryption        exports
```

## Quick Start (Local)

### Prerequisites
- Docker + Docker Compose
- Node 20+

### 1. Start infrastructure

```bash
cd infrastructure/docker
docker compose up -d
```

This starts:
- PostgreSQL 15 (port 5432)
- LocalStack (port 4566) — emulates S3, KMS, Cognito, EventBridge
- Redis 7 (port 6379)

### 2. Backend

```bash
cd backend
cp .env.example .env.local
npm install
npm run migration:run
npm run seed
npm run start:dev
```

API: http://localhost:3000  
Swagger UI: http://localhost:3000/api/docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:3001

---

## Key Features

| Feature | Implementation |
|---|---|
| Multi-tenancy | PostgreSQL RLS via `SET app.current_tenant_id` |
| Auth | AWS Cognito JWT · RS256 · JWKS validation |
| RBAC | ADMIN / OPERATOR / VIEWER roles |
| Interest accrual | Actual/360 · nightly cron + EventBridge |
| Floating rates | SOFR / PRIME from `index_rate_history` |
| Payment allocation | 100% manual (PRINCIPAL / INTEREST / FEE / PREPAYMENT) |
| PII encryption | KMS field-level encryption for SSN / Tax ID |
| Snowflake export | NDJSON → S3 → external stage COPY INTO |
| Audit trail | Partitioned `audit_logs` + `AuditInterceptor` |
| Schedule gen | Newton-Raphson level payment · all frequencies |

## API Endpoints

### Loans
| Method | Path | Description |
|---|---|---|
| POST | /loans | Create loan |
| GET | /loans | List loans (filterable) |
| GET | /loans/:id | Get loan |
| POST | /loans/:id/activate | Activate (triggers schedule gen) |
| POST | /loans/:id/modify | Modify rate/term |
| GET | /loans/:id/schedule | Amortization schedule |

### Payments
| Method | Path | Description |
|---|---|---|
| POST | /loans/:id/payments | Post payment with manual allocation |
| GET | /loans/:id/payments | Payment history |
| POST | /loans/:id/payments/preview | Preview suggested allocation |
| POST | /loans/:id/payments/:pid/reverse | Reverse payment (ADMIN) |

### Disbursements
| Method | Path | Description |
|---|---|---|
| POST | /loans/:id/disbursements | Create disbursement |
| GET | /loans/:id/disbursements | List disbursements |
| POST | /loans/:id/disbursements/:did/approve | Approve (ADMIN) |

### Fees
| Method | Path | Description |
|---|---|---|
| POST | /loans/:id/fees | Assess fee |
| GET | /loans/:id/fees | List fees |
| POST | /loans/:id/fees/:fid/waive | Waive fee (ADMIN) |

### Reports
| Method | Path | Description |
|---|---|---|
| GET | /reports/active-loans | Portfolio summary |
| GET | /reports/delinquency | DPD bucket report |
| GET | /reports/amount-due | Scheduled vs paid |
| POST | /reports/snowflake-export | Trigger S3 export |

## Infrastructure (AWS)

Provisioned via Terraform in `infrastructure/terraform/`:

- **Aurora PostgreSQL 15** — Serverless v2 (0.5–16 ACU), encrypted, 35-day backups
- **ECS Fargate** — API service + nightly worker task
- **Cognito User Pool** — MFA, custom `tenant_id`/`role` attributes
- **KMS** — Dedicated key for PII field encryption
- **S3** — Exports bucket with SSE-KMS and versioning
- **EventBridge** — Nightly accrual cron (00:00 UTC)
- **CloudWatch** — Log groups + p99 latency alarm

```bash
cd infrastructure/terraform
terraform init
terraform plan -var="environment=staging"
terraform apply -var="environment=staging"
```

## Project Structure

```
loan-platform/
├── backend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── common/           # Guards, interceptors, decorators, enums
│   │   ├── config/           # App, database, AWS config
│   │   ├── database/         # Migrations, seeds
│   │   └── modules/
│   │       ├── auth/         # JWT strategy, Cognito integration
│   │       ├── loans/        # Loan service + controller
│   │       ├── borrowers/    # Borrower service (KMS PII)
│   │       ├── disbursements/
│   │       ├── payments/     # Manual allocation engine
│   │       ├── schedule/     # Amortization schedule gen
│   │       ├── interest/     # Actual/360 accrual cron
│   │       ├── fees/
│   │       ├── reports/      # Analytics + Snowflake export
│   │       └── audit/
│   └── Dockerfile
├── frontend/
│   ├── src/app/
│   │   ├── dashboard/        # Portfolio overview
│   │   ├── loans/
│   │   │   ├── [loanId]/     # Loan detail (schedule, payments, disbursements)
│   │   │   └── new/          # Create loan form
│   │   ├── reports/          # Portfolio analytics
│   │   └── delinquency/      # DPD management
│   └── Dockerfile
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml
│   │   ├── localstack-init.sh
│   │   └── postgres-init.sh
│   └── terraform/
│       └── main.tf
└── docs/
    └── openapi.yaml
```

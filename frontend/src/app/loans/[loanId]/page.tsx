'use client';
import { useState } from 'react';
import { ChevronLeft, DollarSign, Calendar, TrendingUp, AlertCircle, CheckCircle, Clock, Edit, Plus } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleRow { period: number; dueDate: string; beginBal: number; principal: number; interest: number; fees: number; total: number; endBal: number; status: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE'; }
interface PaymentRow  { id: string; date: string; amount: number; status: 'APPLIED' | 'REVERSED'; allocations: { bucket: string; amount: number }[]; }

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_LOAN = {
  id: '44444444-0000-0000-0000-000000000001',
  loanNumber: 'APX-2024-0001',
  status: 'CURRENT',
  borrowers: [{ name: 'Smith Holdings LLC', role: 'PRIMARY' }],
  loanAmount: 500_000,
  outstandingBalance: 487_523.45,
  accruedInterest: 1_245.33,
  interestType: 'FIXED',
  fixedRate: 0.085,
  interestMethod: 'ACTUAL_360',
  loanTermMonths: 60,
  originationDate: '2024-01-15',
  maturityDate: '2029-01-15',
  paymentFrequency: 'MONTHLY',
  nextPaymentDate: '2025-06-15',
  daysPastDue: 0,
  purpose: 'Commercial Real Estate',
};

const MOCK_SCHEDULE: ScheduleRow[] = [
  { period: 1,  dueDate: '2024-02-15', beginBal: 500_000, principal: 7_952,  interest: 3_541.67, fees: 0, total: 11_493.67, endBal: 492_048, status: 'PAID'    },
  { period: 2,  dueDate: '2024-03-15', beginBal: 492_048, principal: 8_008,  interest: 3_485.34, fees: 0, total: 11_493.67, endBal: 484_040, status: 'PAID'    },
  { period: 3,  dueDate: '2024-04-15', beginBal: 484_040, principal: 8_065,  interest: 3_428.62, fees: 0, total: 11_493.67, endBal: 475_975, status: 'PAID'    },
  { period: 4,  dueDate: '2024-05-15', beginBal: 475_975, principal: 8_122,  interest: 3_371.49, fees: 0, total: 11_493.67, endBal: 467_853, status: 'PAID'    },
  { period: 5,  dueDate: '2024-06-15', beginBal: 467_853, principal: 8_179,  interest: 3_314.18, fees: 0, total: 11_493.67, endBal: 459_674, status: 'PARTIAL' },
  { period: 6,  dueDate: '2024-07-15', beginBal: 459_674, principal: 8_237,  interest: 3_256.19, fees: 0, total: 11_493.67, endBal: 451_437, status: 'PENDING' },
  { period: 7,  dueDate: '2024-08-15', beginBal: 451_437, principal: 8_296,  interest: 3_197.80, fees: 0, total: 11_493.67, endBal: 443_141, status: 'PENDING' },
  { period: 8,  dueDate: '2024-09-15', beginBal: 443_141, principal: 8_355,  interest: 3_138.86, fees: 0, total: 11_493.67, endBal: 434_786, status: 'PENDING' },
];

const MOCK_PAYMENTS: PaymentRow[] = [
  { id: '1', date: '2024-01-15', amount: 11_493.67, status: 'APPLIED', allocations: [{ bucket: 'INTEREST', amount: 3_541.67 }, { bucket: 'PRINCIPAL', amount: 7_952.00 }] },
  { id: '2', date: '2024-02-15', amount: 11_493.67, status: 'APPLIED', allocations: [{ bucket: 'INTEREST', amount: 3_485.34 }, { bucket: 'PRINCIPAL', amount: 8_008.33 }] },
  { id: '3', date: '2024-03-15', amount: 11_493.67, status: 'APPLIED', allocations: [{ bucket: 'INTEREST', amount: 3_428.62 }, { bucket: 'PRINCIPAL', amount: 8_065.05 }] },
  { id: '4', date: '2024-04-15', amount: 5_000.00,  status: 'APPLIED', allocations: [{ bucket: 'INTEREST', amount: 3_371.49 }, { bucket: 'PRINCIPAL', amount: 1_628.51 }] },
];

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// ─── Tab component ────────────────────────────────────────────────────────────

function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t} className={`tab ${active === t ? 'tab-active' : ''}`} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Schedule row status icon ─────────────────────────────────────────────────

function ScheduleStatusIcon({ status }: { status: string }) {
  if (status === 'PAID')    return <CheckCircle size={14} className="icon-green" />;
  if (status === 'PARTIAL') return <Clock size={14} className="icon-amber" />;
  if (status === 'OVERDUE') return <AlertCircle size={14} className="icon-red" />;
  return <Clock size={14} className="icon-muted" />;
}

// ─── Main Loan Detail Page ────────────────────────────────────────────────────

export default function LoanDetail() {
  const [activeTab, setActiveTab] = useState('Schedule');

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #0a0c10;
          --surface:  #111318;
          --surface2: #191c23;
          --border:   rgba(255,255,255,0.07);
          --text:     #e2e8f0;
          --muted:    #6b7280;
          --accent:   #6366f1;
          --accent2:  #818cf8;
          --green:    #10b981;
          --amber:    #f59e0b;
          --red:      #ef4444;
          --mono:     'DM Mono', monospace;
          --sans:     'Syne', sans-serif;
          --r:        10px;
        }

        body { background: var(--bg); color: var(--text); font-family: var(--sans); }

        .page       { max-width: 1200px; margin: 0 auto; padding: 32px; }
        .back-btn   { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; cursor: pointer; margin-bottom: 24px; transition: color .15s; }
        .back-btn:hover { color: var(--text); }

        /* ── Header ──────────────────────────────────────────────────────── */
        .loan-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
        .loan-number-big { font-family: var(--mono); font-size: 13px; color: var(--accent2); margin-bottom: 6px; }
        .loan-title { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
        .loan-meta  { display: flex; gap: 16px; margin-top: 10px; }
        .meta-chip  { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 12px; color: var(--muted); }
        .meta-chip strong { color: var(--text); }
        .header-actions { display: flex; gap: 10px; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: var(--r); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--sans); display: flex; align-items: center; gap: 6px; transition: all .15s; }
        .btn-outline:hover { border-color: var(--accent); color: var(--accent2); }
        .btn-primary { background: var(--accent); border: none; color: #fff; padding: 8px 16px; border-radius: var(--r); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--sans); display: flex; align-items: center; gap: 6px; transition: opacity .15s; }
        .btn-primary:hover { opacity: 0.88; }

        /* ── Summary cards ───────────────────────────────────────────────── */
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
        .summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 18px 20px; }
        .card-label   { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
        .card-value   { font-size: 22px; font-weight: 700; font-family: var(--mono); letter-spacing: -0.5px; }
        .card-sub     { font-size: 11px; color: var(--muted); margin-top: 4px; }

        /* ── Loan details panel ───────────────────────────────────────────── */
        .detail-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 28px; }
        .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 20px; }
        .panel-title { font-size: 13px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; letter-spacing: 0.02em; }
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
        .field-row  { padding: 9px 0; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 3px; }
        .field-row:last-child { border-bottom: none; }
        .field-key  { font-size: 11px; color: var(--muted); font-weight: 500; }
        .field-val  { font-size: 13px; font-weight: 500; font-family: var(--mono); }
        .borrower-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
        .borrower-name { font-weight: 600; font-size: 14px; }
        .borrower-role { font-size: 11px; padding: 3px 10px; background: var(--surface2); border-radius: 20px; color: var(--muted); }

        /* ── Tabs ────────────────────────────────────────────────────────── */
        .tabs       { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
        .tab        { padding: 11px 20px; font-size: 13px; font-weight: 600; color: var(--muted); border: none; background: transparent; cursor: pointer; font-family: var(--sans); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all .15s; }
        .tab:hover  { color: var(--text); }
        .tab-active { color: var(--accent2); border-bottom-color: var(--accent); }

        /* ── Schedule table ──────────────────────────────────────────────── */
        .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .data-table th { padding: 9px 14px; text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); }
        .data-table td { padding: 11px 14px; border-bottom: 1px solid var(--border); }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: var(--surface2); }
        .mono  { font-family: var(--mono); }
        .right { text-align: right; }
        .icon-green { color: var(--green); }
        .icon-amber { color: var(--amber); }
        .icon-red   { color: var(--red); }
        .icon-muted { color: var(--muted); }

        /* ── Allocation chips ────────────────────────────────────────────── */
        .alloc-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .alloc-chip  { font-size: 10.5px; padding: 2px 8px; border-radius: 4px; font-family: var(--mono); font-weight: 500; }
        .chip-interest { background: rgba(99,102,241,.15); color: #a5b4fc; }
        .chip-principal { background: rgba(16,185,129,.15); color: #6ee7b7; }
        .chip-fee       { background: rgba(245,158,11,.15); color: #fcd34d; }
        .chip-prepayment { background: rgba(100,116,139,.15); color: #94a3b8; }

        .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .pill-paid    { background: rgba(16,185,129,.12); color: var(--green); }
        .pill-partial { background: rgba(245,158,11,.12); color: var(--amber); }
        .pill-pending { background: rgba(100,116,139,.12); color: var(--muted); }
        .pill-overdue { background: rgba(239,68,68,.12);   color: var(--red);   }
        .pill-applied { background: rgba(16,185,129,.12); color: var(--green); }
        .pill-reversed { background: rgba(239,68,68,.12); color: var(--red); }
      `}</style>

      <div className="page">
        {/* Back */}
        <div className="back-btn">
          <ChevronLeft size={14} />
          Back to Portfolio
        </div>

        {/* Header */}
        <div className="loan-header">
          <div>
            <div className="loan-number-big">{MOCK_LOAN.loanNumber}</div>
            <div className="loan-title">Smith Holdings LLC</div>
            <div className="loan-meta">
              <span className="meta-chip">Status: <strong>Current</strong></span>
              <span className="meta-chip">Type: <strong>{MOCK_LOAN.interestType}</strong></span>
              <span className="meta-chip">Rate: <strong>{(MOCK_LOAN.fixedRate * 100).toFixed(2)}%</strong></span>
              <span className="meta-chip">Freq: <strong>{MOCK_LOAN.paymentFrequency}</strong></span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn-outline"><Edit size={13} />Modify Loan</button>
            <button className="btn-primary"><Plus size={13} />Apply Payment</button>
          </div>
        </div>

        {/* Summary */}
        <div className="summary-grid">
          <div className="summary-card">
            <div className="card-label"><DollarSign size={12} />Outstanding Balance</div>
            <div className="card-value">{fmt(MOCK_LOAN.outstandingBalance)}</div>
            <div className="card-sub">of {fmt(MOCK_LOAN.loanAmount)} original</div>
          </div>
          <div className="summary-card">
            <div className="card-label"><TrendingUp size={12} />Accrued Interest</div>
            <div className="card-value" style={{ color: 'var(--accent2)' }}>{fmt(MOCK_LOAN.accruedInterest)}</div>
            <div className="card-sub">Actual/360 daily</div>
          </div>
          <div className="summary-card">
            <div className="card-label"><Calendar size={12} />Next Payment</div>
            <div className="card-value" style={{ fontSize: 18 }}>{MOCK_LOAN.nextPaymentDate}</div>
            <div className="card-sub">{MOCK_LOAN.daysPastDue === 0 ? 'On time' : `${MOCK_LOAN.daysPastDue} days past due`}</div>
          </div>
          <div className="summary-card">
            <div className="card-label"><Calendar size={12} />Maturity Date</div>
            <div className="card-value" style={{ fontSize: 18 }}>{MOCK_LOAN.maturityDate}</div>
            <div className="card-sub">{MOCK_LOAN.loanTermMonths} month term</div>
          </div>
        </div>

        {/* Detail grid */}
        <div className="detail-grid">
          <div className="panel">
            <div className="panel-title"><TrendingUp size={13} />Loan Terms</div>
            <div className="field-grid">
              {[
                ['Loan Amount', fmt(MOCK_LOAN.loanAmount)],
                ['Interest Type', MOCK_LOAN.interestType],
                ['Fixed Rate', `${(MOCK_LOAN.fixedRate * 100).toFixed(3)}%`],
                ['Interest Method', MOCK_LOAN.interestMethod],
                ['Term', `${MOCK_LOAN.loanTermMonths} months`],
                ['Payment Freq', MOCK_LOAN.paymentFrequency],
                ['Origination', MOCK_LOAN.originationDate],
                ['Maturity', MOCK_LOAN.maturityDate],
                ['First Payment', MOCK_LOAN.nextPaymentDate],
                ['Purpose', MOCK_LOAN.purpose],
              ].map(([k, v]) => (
                <div className="field-row" key={k}>
                  <span className="field-key">{k}</span>
                  <span className="field-val">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Borrowers</div>
            {MOCK_LOAN.borrowers.map((b) => (
              <div className="borrower-row" key={b.name}>
                <div>
                  <div className="borrower-name">{b.name}</div>
                </div>
                <span className="borrower-role">{b.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={['Schedule', 'Payments', 'Disbursements']}
          active={activeTab}
          onChange={setActiveTab}
        />

        {/* Schedule tab */}
        {activeTab === 'Schedule' && (
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due Date</th>
                  <th className="right">Begin Balance</th>
                  <th className="right">Principal</th>
                  <th className="right">Interest</th>
                  <th className="right">Total</th>
                  <th className="right">End Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_SCHEDULE.map((row) => (
                  <tr key={row.period}>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{row.period}</td>
                    <td className="mono">{row.dueDate}</td>
                    <td className="mono right">{fmt(row.beginBal)}</td>
                    <td className="mono right" style={{ color: '#6ee7b7' }}>{fmt(row.principal)}</td>
                    <td className="mono right" style={{ color: '#a5b4fc' }}>{fmt(row.interest)}</td>
                    <td className="mono right" style={{ fontWeight: 600 }}>{fmt(row.total)}</td>
                    <td className="mono right">{fmt(row.endBal)}</td>
                    <td>
                      <span className={`status-pill pill-${row.status.toLowerCase()}`}>
                        <ScheduleStatusIcon status={row.status} />
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payments tab */}
        {activeTab === 'Payments' && (
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="right">Amount</th>
                  <th>Allocations</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_PAYMENTS.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.date}</td>
                    <td className="mono right" style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
                    <td>
                      <div className="alloc-chips">
                        {p.allocations.map((a) => (
                          <span key={a.bucket} className={`alloc-chip chip-${a.bucket.toLowerCase()}`}>
                            {a.bucket} {fmt(a.amount)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill pill-${p.status.toLowerCase()}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Disbursements tab */}
        {activeTab === 'Disbursements' && (
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th className="right">Amount</th>
                  <th className="right">Prepaid Fee</th>
                  <th className="right">Net Disbursed</th>
                  <th>Reference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono" style={{ color: 'var(--muted)' }}>1</td>
                  <td className="mono">2024-01-15</td>
                  <td className="mono right">{fmt(500_000)}</td>
                  <td className="mono right" style={{ color: 'var(--amber)' }}>{fmt(2_500)}</td>
                  <td className="mono right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(497_500)}</td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>WIRE-20240115-001</td>
                  <td><span className="status-pill pill-paid">DISBURSED</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

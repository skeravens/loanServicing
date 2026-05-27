'use client';
import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Clock, FileText, ArrowUpRight, ChevronRight, Activity } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalLoans: number;
  totalOutstanding: number;
  totalAccruedInterest: number;
  delinquencyRate: number;
  byStatus: Record<string, { count: number; balance: number }>;
}

interface LoanRow {
  id: string;
  loanNumber: string;
  status: 'ACTIVE' | 'CURRENT' | 'DELINQUENT' | 'DEFAULT' | 'PENDING';
  outstandingBalance: number;
  effectiveRate: number;
  nextPaymentDate: string;
  daysPastDue: number;
  borrowerName: string;
}

// ─── Mock data (replace with SWR/React Query fetches) ─────────────────────────

const MOCK_STATS: DashboardStats = {
  totalLoans: 142,
  totalOutstanding: 47_832_540.00,
  totalAccruedInterest: 87_234.56,
  delinquencyRate: 4.2,
  byStatus: {
    CURRENT:    { count: 118, balance: 41_200_000 },
    DELINQUENT: { count: 14,  balance: 4_900_000  },
    DEFAULT:    { count: 3,   balance: 1_100_000  },
    PENDING:    { count: 7,   balance: 632_540    },
  },
};

const MOCK_LOANS: LoanRow[] = [
  { id: '1', loanNumber: 'APX-2024-0001', status: 'CURRENT',    outstandingBalance: 487_523,  effectiveRate: 0.085, nextPaymentDate: '2025-06-15', daysPastDue: 0,  borrowerName: 'Smith Holdings LLC'     },
  { id: '2', loanNumber: 'APX-2024-0002', status: 'DELINQUENT', outstandingBalance: 241_000,  effectiveRate: 0.078, nextPaymentDate: '2025-05-01', daysPastDue: 22, borrowerName: 'Meridian Corp'          },
  { id: '3', loanNumber: 'APX-2024-0019', status: 'CURRENT',    outstandingBalance: 1_200_000, effectiveRate: 0.092, nextPaymentDate: '2025-06-30', daysPastDue: 0,  borrowerName: 'Pacific Real Estate Partners' },
  { id: '4', loanNumber: 'APX-2024-0031', status: 'DELINQUENT', outstandingBalance: 78_900,   effectiveRate: 0.095, nextPaymentDate: '2025-04-15', daysPastDue: 38, borrowerName: 'Apex Ventures'         },
  { id: '5', loanNumber: 'APX-2024-0044', status: 'DEFAULT',    outstandingBalance: 340_000,  effectiveRate: 0.110, nextPaymentDate: '2025-02-01', daysPastDue: 112,'borrowerName': 'Blue Ridge Capital'  },
  { id: '6', loanNumber: 'APX-2024-0055', status: 'CURRENT',    outstandingBalance: 890_000,  effectiveRate: 0.075, nextPaymentDate: '2025-07-01', daysPastDue: 0,  borrowerName: 'Sunrise Group'         },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtRate = (r: number) => `${(r * 100).toFixed(2)}%`;

const statusConfig = {
  CURRENT:    { label: 'Current',    bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  ACTIVE:     { label: 'Active',     bg: 'bg-blue-500/15',    text: 'text-blue-400',    dot: 'bg-blue-400'    },
  DELINQUENT: { label: 'Delinquent', bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
  DEFAULT:    { label: 'Default',    bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400'     },
  PENDING:    { label: 'Pending',    bg: 'bg-slate-500/15',   text: 'text-slate-400',   dot: 'bg-slate-400'   },
};

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon: Icon, trend, trendUp,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: string; trendUp?: boolean;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between mb-3">
        <div className="metric-icon">
          <Icon size={18} />
        </div>
        {trend && (
          <span className={`trend-badge ${trendUp ? 'trend-up' : 'trend-down'}`}>
            {trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend}
          </span>
        )}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.PENDING;
  return (
    <span className={`status-badge ${cfg.bg} ${cfg.text}`}>
      <span className={`status-dot ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Portfolio Bar ─────────────────────────────────────────────────────────────

function PortfolioBar({ byStatus }: { byStatus: DashboardStats['byStatus'] }) {
  const total = Object.values(byStatus).reduce((s, v) => s + v.balance, 0);
  const segments = [
    { key: 'CURRENT',    color: '#10b981', label: 'Current'    },
    { key: 'DELINQUENT', color: '#f59e0b', label: 'Delinquent' },
    { key: 'DEFAULT',    color: '#ef4444', label: 'Default'     },
    { key: 'PENDING',    color: '#64748b', label: 'Pending'     },
  ];

  return (
    <div className="portfolio-bar-wrapper">
      <div className="portfolio-bar">
        {segments.map(({ key, color }) => {
          const pct = ((byStatus[key]?.balance ?? 0) / total) * 100;
          return pct > 0 ? (
            <div
              key={key}
              className="portfolio-segment"
              style={{ width: `${pct}%`, background: color }}
              title={`${key}: ${pct.toFixed(1)}%`}
            />
          ) : null;
        })}
      </div>
      <div className="portfolio-legend">
        {segments.map(({ key, color, label }) => (
          <div key={key} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            <span className="legend-label">{label}</span>
            <span className="legend-value">{fmt(byStatus[key]?.balance ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Loans Table ─────────────────────────────────────────────────────────────

function LoansTable({ loans, onSelect }: { loans: LoanRow[]; onSelect: (id: string) => void }) {
  return (
    <div className="table-wrapper">
      <table className="loans-table">
        <thead>
          <tr>
            <th>Loan #</th>
            <th>Borrower</th>
            <th>Status</th>
            <th className="text-right">Balance</th>
            <th className="text-right">Rate</th>
            <th>Next Payment</th>
            <th className="text-right">DPD</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id} className="table-row" onClick={() => onSelect(loan.id)}>
              <td className="loan-number">{loan.loanNumber}</td>
              <td className="borrower-name">{loan.borrowerName}</td>
              <td><StatusBadge status={loan.status} /></td>
              <td className="text-right balance">{fmt(loan.outstandingBalance)}</td>
              <td className="text-right rate">{fmtRate(loan.effectiveRate)}</td>
              <td className="date">{loan.nextPaymentDate}</td>
              <td className={`text-right dpd ${loan.daysPastDue > 0 ? 'dpd-past' : ''}`}>
                {loan.daysPastDue > 0 ? loan.daysPastDue : '—'}
              </td>
              <td className="action-cell">
                <ChevronRight size={14} className="chevron" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export default function Dashboard() {
  const [stats] = useState<DashboardStats>(MOCK_STATS);
  const [loans] = useState<LoanRow[]>(MOCK_LOANS);
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const filteredLoans = loans.filter((l) => {
    const matchStatus = filter === 'ALL' || l.status === filter;
    const matchSearch = l.loanNumber.toLowerCase().includes(search.toLowerCase()) ||
      l.borrowerName.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:        #0a0c10;
          --surface:   #111318;
          --surface2:  #191c23;
          --border:    rgba(255,255,255,0.07);
          --text:      #e2e8f0;
          --text-muted:#6b7280;
          --accent:    #6366f1;
          --accent2:   #818cf8;
          --green:     #10b981;
          --amber:     #f59e0b;
          --red:       #ef4444;
          --mono:      'DM Mono', monospace;
          --sans:      'Syne', sans-serif;
          --radius:    10px;
        }

        body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; }

        /* ── Layout ─────────────────────────────────────────────────────── */
        .layout    { display: flex; min-height: 100vh; }
        .sidebar   { width: 220px; background: var(--surface); border-right: 1px solid var(--border); padding: 28px 0; flex-shrink: 0; }
        .main      { flex: 1; overflow-y: auto; }
        .topbar    { padding: 20px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--bg); position: sticky; top: 0; z-index: 10; }
        .content   { padding: 32px; }

        /* ── Sidebar ─────────────────────────────────────────────────────── */
        .brand     { padding: 0 24px 28px; font-size: 17px; font-weight: 800; letter-spacing: -0.3px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
        .brand span { color: var(--accent2); }
        .nav-item  { display: flex; align-items: center; gap: 10px; padding: 10px 24px; color: var(--text-muted); font-size: 13.5px; font-weight: 500; cursor: pointer; transition: all .15s; border-left: 2px solid transparent; }
        .nav-item:hover, .nav-item.active { color: var(--text); background: var(--surface2); border-left-color: var(--accent); }
        .nav-section { padding: 16px 24px 6px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }

        /* ── Topbar ──────────────────────────────────────────────────────── */
        .page-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
        .topbar-right { display: flex; align-items: center; gap: 12px; }
        .btn-primary { background: var(--accent); color: #fff; border: none; padding: 8px 18px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--sans); display: flex; align-items: center; gap: 6px; transition: opacity .15s; }
        .btn-primary:hover { opacity: 0.88; }
        .avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--surface2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--accent2); }

        /* ── Metric cards ────────────────────────────────────────────────── */
        .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .metric-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
        .metric-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--surface2); display: flex; align-items: center; justify-content: center; color: var(--accent2); }
        .metric-value { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin-top: 12px; font-family: var(--mono); }
        .metric-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; font-weight: 500; }
        .metric-sub   { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .trend-badge  { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }
        .trend-up     { background: rgba(16,185,129,.12); color: var(--green); }
        .trend-down   { background: rgba(239,68,68,.12); color: var(--red); }

        /* ── Portfolio bar ───────────────────────────────────────────────── */
        .portfolio-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 24px; }
        .section-title { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .portfolio-bar { height: 8px; border-radius: 4px; overflow: hidden; display: flex; gap: 2px; background: var(--surface2); }
        .portfolio-segment { height: 100%; border-radius: 2px; transition: opacity .15s; }
        .portfolio-segment:hover { opacity: 0.7; }
        .portfolio-legend { display: flex; gap: 20px; margin-top: 14px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .legend-label { color: var(--text-muted); }
        .legend-value { font-family: var(--mono); font-size: 11px; color: var(--text); }

        /* ── Table ───────────────────────────────────────────────────────── */
        .table-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .table-header { padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
        .filter-row { display: flex; gap: 8px; align-items: center; }
        .filter-pill { padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-family: var(--sans); transition: all .15s; }
        .filter-pill.active, .filter-pill:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
        .search-input { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 14px; color: var(--text); font-size: 13px; font-family: var(--sans); outline: none; width: 220px; }
        .search-input:focus { border-color: var(--accent); }
        .table-wrapper { overflow-x: auto; }
        .loans-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .loans-table th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
        .table-row { border-bottom: 1px solid var(--border); cursor: pointer; transition: background .1s; }
        .table-row:hover { background: var(--surface2); }
        .loans-table td { padding: 13px 16px; }
        .loan-number { font-family: var(--mono); font-size: 12px; font-weight: 500; color: var(--accent2); }
        .borrower-name { font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .balance { font-family: var(--mono); font-weight: 500; }
        .rate { font-family: var(--mono); color: var(--text-muted); }
        .date { color: var(--text-muted); font-family: var(--mono); font-size: 12px; }
        .dpd { font-family: var(--mono); font-weight: 600; color: var(--text-muted); }
        .dpd-past { color: var(--red); }
        .action-cell { text-align: right; }
        .chevron { color: var(--text-muted); transition: transform .15s; }
        .table-row:hover .chevron { transform: translateX(2px); color: var(--text); }

        /* ── Status badges ────────────────────────────────────────────────── */
        .status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* ── Alert banner ─────────────────────────────────────────────────── */
        .alert-banner { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #fca5a5; }

        .text-right { text-align: right; }
      `}</style>

      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="brand">Loan<span>OS</span></div>
          <div className="nav-section">Portfolio</div>
          <div className="nav-item active"><Activity size={15} />Dashboard</div>
          <div className="nav-item"><FileText size={15} />All Loans</div>
          <div className="nav-item"><DollarSign size={15} />Payments</div>
          <div className="nav-item"><Clock size={15} />Schedule</div>
          <div className="nav-section">Analytics</div>
          <div className="nav-item"><TrendingUp size={15} />Reports</div>
          <div className="nav-item"><AlertTriangle size={15} />Delinquency</div>
        </aside>

        <div className="main">
          {/* Topbar */}
          <div className="topbar">
            <div className="page-title">Portfolio Dashboard</div>
            <div className="topbar-right">
              <button className="btn-primary">
                <ArrowUpRight size={14} />
                New Loan
              </button>
              <div className="avatar">AD</div>
            </div>
          </div>

          <div className="content">
            {/* Alert */}
            {stats.delinquencyRate > 3 && (
              <div className="alert-banner">
                <AlertTriangle size={15} />
                <strong>{stats.byStatus.DELINQUENT?.count ?? 0} delinquent loans</strong> totaling {fmt(stats.byStatus.DELINQUENT?.balance ?? 0)} require attention.
              </div>
            )}

            {/* Metrics */}
            <div className="metrics-grid">
              <MetricCard
                label="Total Portfolio"
                value={fmt(stats.totalOutstanding)}
                sub={`${stats.totalLoans} active loans`}
                icon={DollarSign}
                trend="+2.3%"
                trendUp
              />
              <MetricCard
                label="Accrued Interest"
                value={fmt(stats.totalAccruedInterest)}
                sub="as of today"
                icon={TrendingUp}
              />
              <MetricCard
                label="Delinquency Rate"
                value={`${stats.delinquencyRate}%`}
                sub={`${stats.byStatus.DELINQUENT?.count ?? 0} loans past due`}
                icon={AlertTriangle}
                trend="+0.8%"
                trendUp={false}
              />
              <MetricCard
                label="Active Loans"
                value={String(stats.byStatus.CURRENT?.count ?? 0)}
                sub={`of ${stats.totalLoans} total`}
                icon={FileText}
                trend="+4"
                trendUp
              />
            </div>

            {/* Portfolio distribution */}
            <div className="portfolio-section">
              <div className="section-title">
                <Activity size={14} />
                Portfolio Composition
              </div>
              <PortfolioBar byStatus={stats.byStatus} />
            </div>

            {/* Loans table */}
            <div className="table-section">
              <div className="table-header">
                <div className="section-title" style={{ margin: 0 }}>Recent Loans</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="filter-row">
                    {['ALL', 'CURRENT', 'DELINQUENT', 'DEFAULT', 'PENDING'].map((s) => (
                      <button
                        key={s}
                        className={`filter-pill ${filter === s ? 'active' : ''}`}
                        onClick={() => setFilter(s)}
                      >
                        {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <input
                    className="search-input"
                    placeholder="Search loans..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <LoansTable loans={filteredLoans} onSelect={(id) => console.log('Navigate to loan', id)} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, ArrowUpDown, Search } from 'lucide-react';
import { api } from '../../lib/api';
import type { Loan, LoanStatus } from '../../types';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');`;

const fmt = (v: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v));

type DPDBucket = '1-30' | '31-60' | '61-90' | '90+' | 'ALL';

const BUCKET_LABELS: Record<DPDBucket, string> = {
  ALL: 'All Delinquent',
  '1-30': '1–30 DPD',
  '31-60': '31–60 DPD',
  '61-90': '61–90 DPD',
  '90+': '90+ DPD',
};

const DPD_COLORS: Record<DPDBucket, string> = {
  ALL: '#f59e0b',
  '1-30': '#f59e0b',
  '31-60': '#f97316',
  '61-90': '#ef4444',
  '90+': '#dc2626',
};

function getBucket(dpd: number): DPDBucket {
  if (dpd <= 30) return '1-30';
  if (dpd <= 60) return '31-60';
  if (dpd <= 90) return '61-90';
  return '90+';
}

function DPDPill({ dpd }: { dpd: number }) {
  const bucket = getBucket(dpd);
  const color = DPD_COLORS[bucket];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}
    >
      {dpd}d
    </span>
  );
}

export default function DelinquencyPage() {
  const router = useRouter();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState<DPDBucket>('ALL');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'daysPastDue' | 'outstandingBalance'>('daysPastDue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ data: Loan[] }>('/loans?status=DELINQUENT,DEFAULT&limit=100');
        setLoans(res.data ?? []);
      } catch {
        setLoans([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const filtered = loans
    .filter((l) => {
      if (bucket !== 'ALL') {
        if (getBucket(l.daysPastDue) !== bucket) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          l.loanNumber.toLowerCase().includes(q) ||
          l.loanName?.toLowerCase().includes(q) ||
          l.borrowers?.some((b) => b.displayName.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      const av = sortField === 'daysPastDue' ? a.daysPastDue : parseFloat(a.outstandingBalance);
      const bv = sortField === 'daysPastDue' ? b.daysPastDue : parseFloat(b.outstandingBalance);
      return sortDir === 'asc' ? av - bv : bv - av;
    });

  const bucketCounts = loans.reduce<Record<DPDBucket, number>>(
    (acc, l) => { acc[getBucket(l.daysPastDue)]++; return acc; },
    { 'ALL': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
  );
  bucketCounts.ALL = loans.length;

  const totalExposure = filtered.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0);

  return (
    <>
      <style>{FONT}</style>
      <div className="min-h-screen bg-[#0d0d1a] text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
        {/* Header */}
        <div className="border-b border-[#1e1e30] px-8 py-5">
          <div className="flex items-center gap-3 mb-1">
            <AlertTriangle size={20} className="text-amber-400" />
            <h1 className="text-xl font-bold">Delinquency Management</h1>
          </div>
          <p className="text-xs text-gray-500 ml-8">
            {loans.length} delinquent loans · Total exposure {fmt(loans.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0))}
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Bucket tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(Object.keys(BUCKET_LABELS) as DPDBucket[]).map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all
                  ${bucket === b
                    ? 'text-white border'
                    : 'text-gray-500 border border-[#2a2a3e] hover:text-gray-300 bg-[#13132a]'
                  }`}
                style={bucket === b ? {
                  background: DPD_COLORS[b] + '22',
                  borderColor: DPD_COLORS[b] + '66',
                  color: DPD_COLORS[b],
                } : {}}
              >
                {BUCKET_LABELS[b]}
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${bucket === b ? 'bg-white/10' : 'bg-[#1e1e30]'}`}>
                  {bucketCounts[b]}
                </span>
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(['1-30', '31-60', '61-90', '90+'] as DPDBucket[]).map((b) => {
              const cnt = bucketCounts[b];
              const bal = loans
                .filter((l) => getBucket(l.daysPastDue) === b)
                .reduce((s, l) => s + parseFloat(l.outstandingBalance), 0);
              return (
                <button
                  key={b}
                  onClick={() => setBucket(b)}
                  className={`text-left bg-[#13132a] border rounded-2xl p-4 transition-all hover:opacity-90
                    ${bucket === b ? 'border-opacity-60' : 'border-[#2a2a3e]'}`}
                  style={bucket === b ? { borderColor: DPD_COLORS[b] + '66' } : {}}
                >
                  <div className="text-xs text-gray-500 mb-2">{BUCKET_LABELS[b]}</div>
                  <div className="text-xl font-bold" style={{ fontFamily: 'DM Mono', color: DPD_COLORS[b] }}>
                    {cnt}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{fmt(bal)}</div>
                </button>
              );
            })}
          </div>

          {/* Search + table */}
          <div className="bg-[#13132a] border border-[#2a2a3e] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a3e] flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search loans or borrowers…"
                  className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg pl-8 pr-3 py-1.5 text-sm text-white
                    placeholder-gray-600 focus:outline-none focus:border-[#6366f1] transition-colors"
                />
              </div>
              <span className="text-xs text-gray-500">
                {filtered.length} loans · {fmt(totalExposure)} exposure
              </span>
            </div>

            {loading ? (
              <div className="py-16 text-center text-gray-600 text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-600 text-sm">No loans match this filter</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-[#2a2a3e]">
                    <th className="px-5 py-3 text-left font-medium">Loan</th>
                    <th className="px-5 py-3 text-left font-medium">Borrower</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th
                      className="px-5 py-3 text-right font-medium cursor-pointer hover:text-white flex items-center justify-end gap-1"
                      onClick={() => toggleSort('outstandingBalance')}
                    >
                      Balance <ArrowUpDown size={11} />
                    </th>
                    <th
                      className="px-5 py-3 text-right font-medium cursor-pointer hover:text-white"
                      onClick={() => toggleSort('daysPastDue')}
                    >
                      <span className="flex items-center justify-end gap-1">DPD <ArrowUpDown size={11} /></span>
                    </th>
                    <th className="px-5 py-3 text-right font-medium">Maturity</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((loan, i) => (
                    <tr
                      key={loan.id}
                      onClick={() => router.push(`/loans/${loan.id}`)}
                      className="border-b border-[#1e1e30] last:border-0 cursor-pointer hover:bg-[#1a1a2e] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-sm text-white">{loan.loanNumber}</div>
                        {loan.loanName && <div className="text-xs text-gray-500">{loan.loanName}</div>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-300">
                        {loan.borrowers?.[0]?.displayName ?? '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${loan.status === 'DEFAULT'
                            ? 'bg-red-900/30 text-red-400 border border-red-700/30'
                            : 'bg-amber-900/30 text-amber-400 border border-amber-700/30'
                          }`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium text-white" style={{ fontFamily: 'DM Mono' }}>
                        {fmt(loan.outstandingBalance)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <DPDPill dpd={loan.daysPastDue} />
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs text-gray-500">
                        {loan.maturityDate}
                      </td>
                      <td className="px-3 py-3.5">
                        <ChevronRight size={14} className="text-gray-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

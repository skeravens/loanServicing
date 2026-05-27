'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3, TrendingUp, DollarSign, Activity,
  Download, RefreshCw, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api } from '../../lib/api';
import type { ActiveLoansReport, DelinquencyReport } from '../../types';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');`;

const fmt = (v: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v));

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`);

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#6366f1',
  DELINQUENT: '#f59e0b',
  DEFAULT: '#ef4444',
  PAID_OFF: '#10b981',
  PENDING: '#6b7280',
  APPROVED: '#8b5cf6',
  CHARGED_OFF: '#dc2626',
  CLOSED: '#374151',
};

function Card({ icon: Icon, label, value, sub, color = '#6366f1' }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-[#13132a] border border-[#2a2a3e] rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl" style={{ background: color + '22' }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'DM Mono, monospace' }}>
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

function DPDBucket({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const w = total === 0 ? 0 : (count / total) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-medium" style={{ color }}>{count} loans ({pct(count, total)})</span>
      </div>
      <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [portfolio, setPortfolio] = useState<ActiveLoansReport | null>(null);
  const [delinquency, setDelinquency] = useState<DelinquencyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([
        api.get<{ data: ActiveLoansReport }>('/reports/active-loans'),
        api.get<{ data: DelinquencyReport }>('/reports/delinquency'),
      ]);
      setPortfolio(p.data);
      setDelinquency(d.data);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }

  async function triggerExport() {
    setExporting(true);
    setExportMsg('');
    try {
      await api.post('/reports/snowflake-export', {});
      setExportMsg('Export queued — Snowflake will pick up from S3 within ~5 minutes');
    } catch (e) {
      setExportMsg((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalDel = delinquency
    ? delinquency.bucket_1_30 + delinquency.bucket_31_60 + delinquency.bucket_61_90 + delinquency.bucket_90_plus
    : 0;

  const barData = portfolio?.by_status.map((s) => ({
    name: s.status,
    outstanding: parseFloat(s.outstanding),
    count: s.count,
  })) ?? [];

  return (
    <>
      <style>{FONT}</style>
      <div className="min-h-screen bg-[#0d0d1a] text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
        {/* Header */}
        <div className="border-b border-[#1e1e30] px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Reports</h1>
            <p className="text-xs text-gray-500 mt-0.5">Portfolio analytics and data exports</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2a2a3e] text-sm text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={triggerExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6366f1] hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export to Snowflake'}
            </button>
          </div>
        </div>

        {exportMsg && (
          <div className="mx-8 mt-4 bg-emerald-900/20 border border-emerald-700/30 text-emerald-300 text-sm px-5 py-3 rounded-xl">
            {exportMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-600">Loading portfolio data…</div>
        ) : (
          <div className="px-8 py-6 space-y-8">
            {/* KPI cards */}
            {portfolio && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card icon={Activity} label="Total Active Loans" value={String(portfolio.total_loans)} color="#6366f1" />
                <Card icon={DollarSign} label="Total Commitment" value={fmt(portfolio.total_commitment)} color="#8b5cf6" />
                <Card icon={TrendingUp} label="Outstanding Balance" value={fmt(portfolio.total_outstanding)} color="#10b981" />
                <Card
                  icon={AlertTriangle}
                  label="Delinquent Balance"
                  value={delinquency ? fmt(delinquency.total_delinquent_balance) : '—'}
                  sub={delinquency ? `${delinquency.total_delinquent} loans past due` : undefined}
                  color="#f59e0b"
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Outstanding by status chart */}
              {portfolio && (
                <div className="lg:col-span-2 bg-[#13132a] border border-[#2a2a3e] rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-gray-300 mb-4">Outstanding Balance by Status</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                      />
                      <Tooltip
                        contentStyle={{ background: '#13132a', border: '1px solid #2a2a3e', borderRadius: 10, fontSize: 12 }}
                        formatter={(v) => [fmt(v as number), 'Outstanding']}
                      />
                      <Bar dataKey="outstanding" radius={[6, 6, 0, 0]}>
                        {barData.map((entry) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Delinquency buckets */}
              {delinquency && (
                <div className="bg-[#13132a] border border-[#2a2a3e] rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-gray-300 mb-5">Delinquency Buckets</h2>
                  <div className="space-y-4">
                    <DPDBucket label="1–30 DPD" count={delinquency.bucket_1_30} total={totalDel} color="#f59e0b" />
                    <DPDBucket label="31–60 DPD" count={delinquency.bucket_31_60} total={totalDel} color="#f97316" />
                    <DPDBucket label="61–90 DPD" count={delinquency.bucket_61_90} total={totalDel} color="#ef4444" />
                    <DPDBucket label="90+ DPD" count={delinquency.bucket_90_plus} total={totalDel} color="#dc2626" />
                  </div>
                  <div className="mt-5 pt-4 border-t border-[#2a2a3e] flex justify-between text-xs">
                    <span className="text-gray-500">Total delinquent balance</span>
                    <span className="text-amber-400 font-medium" style={{ fontFamily: 'DM Mono' }}>
                      {fmt(delinquency.total_delinquent_balance)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Interest type breakdown */}
            {portfolio && (
              <div className="bg-[#13132a] border border-[#2a2a3e] rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-gray-300 mb-4">Portfolio by Interest Type</h2>
                <div className="flex gap-8">
                  {portfolio.by_interest_type.map((t) => (
                    <div key={t.type} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ background: t.type === 'FIXED' ? '#6366f1' : '#10b981' }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-white">{t.count} loans</div>
                        <div className="text-xs text-gray-500">
                          {t.type === 'FIXED' ? 'Fixed Rate' : 'Floating Rate'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

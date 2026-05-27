'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, AlertCircle, DollarSign } from 'lucide-react';
import { api } from '../../lib/api';
import type { PaymentBucket, ScheduleItem, Fee } from '../../types';

interface AllocationRow {
  bucket: PaymentBucket;
  amount: string;
  scheduleItemId?: string;
  feeId?: string;
}

interface Props {
  loanId: string;
  outstandingBalance: string;
  accruedInterest: string;
  onClose: () => void;
  onSuccess: () => void;
}

const BUCKETS: PaymentBucket[] = ['INTEREST', 'PRINCIPAL', 'FEE', 'PREPAYMENT'];
const BUCKET_COLORS: Record<PaymentBucket, string> = {
  INTEREST: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  PRINCIPAL: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  FEE: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  PREPAYMENT: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
};

export function ApplyPaymentModal({ loanId, outstandingBalance, accruedInterest, onClose, onSuccess }: Props) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalAmount, setTotalAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([
    { bucket: 'INTEREST', amount: accruedInterest },
    { bucket: 'PRINCIPAL', amount: '' },
  ]);
  const [preview, setPreview] = useState<AllocationRow[] | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Allocation sum
  const allocationSum = allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const total = parseFloat(totalAmount) || 0;
  const diff = Math.abs(total - allocationSum);
  const balanced = diff < 0.01;

  async function loadPreview() {
    try {
      const res = await api.post<{ data: AllocationRow[] }>(`/loans/${loanId}/payments/preview`, {
        amount: total,
      });
      setPreview(res.data);
      setAllocations(
        res.data.map((r) => ({ bucket: r.bucket, amount: r.amount })),
      );
    } catch {
      // preview is optional — ignore
    }
  }

  async function handleSubmit() {
    setError('');
    if (!total) return setError('Enter a payment amount');
    if (!balanced) return setError(`Allocations must sum to payment amount (off by $${diff.toFixed(2)})`);

    setSubmitting(true);
    try {
      await api.post(`/loans/${loanId}/payments`, {
        paymentDate,
        amount: total,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: allocations
          .filter((a) => parseFloat(a.amount) > 0)
          .map((a) => ({ ...a, amount: parseFloat(a.amount) })),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const addRow = () => setAllocations((a) => [...a, { bucket: 'PRINCIPAL', amount: '' }]);
  const removeRow = (i: number) => setAllocations((a) => a.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#13132a] border border-[#2a2a3e] rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: 'Syne, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#2a2a3e]">
          <div>
            <h2 className="font-bold text-white">Apply Payment</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Balance: <span className="text-indigo-400">${parseFloat(outstandingBalance).toLocaleString()}</span>
              &nbsp;·&nbsp;Accrued: <span className="text-amber-400">${parseFloat(accruedInterest).toLocaleString()}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-[#1e1e30] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Amount + date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Payment Amount</label>
              <div className="relative">
                <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg pl-8 pr-3 py-2 text-sm text-white
                    focus:outline-none focus:border-[#6366f1] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-white
                  focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Reference (optional)</label>
            <input
              placeholder="Wire ref, check number…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-white
                focus:outline-none focus:border-[#6366f1] transition-colors"
            />
          </div>

          {/* Allocations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Allocation</label>
              <div className="flex gap-2">
                {total > 0 && (
                  <button type="button" onClick={loadPreview} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    Auto-suggest
                  </button>
                )}
                <button type="button" onClick={addRow} className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors">
                  <Plus size={11} /> Row
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {allocations.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={row.bucket}
                    onChange={(e) => setAllocations((a) => a.map((x, idx) => idx === i ? { ...x, bucket: e.target.value as PaymentBucket } : x))}
                    className={`flex-1 appearance-none rounded-lg border px-2.5 py-1.5 text-xs font-medium focus:outline-none transition-colors
                      ${BUCKET_COLORS[row.bucket]} bg-transparent`}
                  >
                    {BUCKETS.map((b) => <option key={b} value={b} className="bg-[#1a1a2e] text-white">{b}</option>)}
                  </select>
                  <div className="relative">
                    <DollarSign size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => setAllocations((a) => a.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                      className="w-32 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg pl-6 pr-2 py-1.5 text-xs text-white
                        focus:outline-none focus:border-[#6366f1] transition-colors"
                    />
                  </div>
                  {allocations.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Balance indicator */}
            <div className={`mt-2 text-xs flex items-center justify-between px-2 py-1.5 rounded-lg
              ${balanced ? 'bg-emerald-900/20 text-emerald-400' : 'bg-amber-900/20 text-amber-400'}`}>
              <span>Allocated: ${allocationSum.toFixed(2)}</span>
              <span>{balanced ? '✓ Balanced' : `$${diff.toFixed(2)} remaining`}</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-3 flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#2a2a3e] text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !balanced || !total}
            className="flex-1 py-2.5 rounded-xl bg-[#6366f1] hover:bg-indigo-500 text-white text-sm font-semibold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Posting…' : 'Post Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

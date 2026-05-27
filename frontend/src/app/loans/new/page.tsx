'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, ChevronDown, AlertCircle, CheckCircle,
} from 'lucide-react';
import { api } from '../../../lib/api';
import type { InterestType, PaymentFrequency, AmortizationType, BorrowerType } from '../../../types';

const FONT = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');
`;

type BorrowerRole = 'PRIMARY' | 'CO_BORROWER' | 'GUARANTOR';

interface BorrowerEntry {
  borrowerId: string;
  role: BorrowerRole;
  displayName: string; // for UI preview only
}

interface FormState {
  loanName: string;
  commitmentAmount: string;
  interestType: InterestType;
  fixedRate: string;
  indexRateName: string;
  marginRate: string;
  rateFloor: string;
  rateCeiling: string;
  paymentFrequency: PaymentFrequency;
  amortizationType: AmortizationType;
  termMonths: string;
  originationDate: string;
  firstPaymentDate: string;
  maturityDate: string;
}

const INITIAL: FormState = {
  loanName: '',
  commitmentAmount: '',
  interestType: 'FIXED',
  fixedRate: '',
  indexRateName: 'SOFR',
  marginRate: '',
  rateFloor: '',
  rateCeiling: '',
  paymentFrequency: 'MONTHLY',
  amortizationType: 'LEVEL_PAYMENT',
  termMonths: '60',
  originationDate: '',
  firstPaymentDate: '',
  maturityDate: '',
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
      {children}
      {error && (
        <span className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </span>
      )}
    </div>
  );
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600
        focus:outline-none focus:border-[#6366f1] transition-colors ${className}`}
      {...props}
    />
  );
}

function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={`w-full appearance-none bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 text-sm text-white
          focus:outline-none focus:border-[#6366f1] transition-colors pr-8 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
    </div>
  );
}

export default function CreateLoanPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [borrowers, setBorrowers] = useState<BorrowerEntry[]>([
    { borrowerId: '', role: 'PRIMARY', displayName: '' },
  ]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'borrowers', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.commitmentAmount || isNaN(Number(form.commitmentAmount)))
      e.commitmentAmount = 'Required — enter a valid dollar amount';
    if (form.interestType === 'FIXED' && !form.fixedRate)
      e.fixedRate = 'Required for fixed rate loans';
    if (form.interestType === 'FLOATING' && !form.marginRate)
      e.marginRate = 'Required for floating rate loans';
    if (!form.originationDate) e.originationDate = 'Required';
    if (!form.firstPaymentDate) e.firstPaymentDate = 'Required';
    if (!form.termMonths || Number(form.termMonths) < 1) e.termMonths = 'Must be at least 1 month';
    if (borrowers.every((b) => !b.borrowerId)) e.borrowers = 'At least one borrower ID required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.post('/loans', {
        ...form,
        commitmentAmount: Number(form.commitmentAmount),
        fixedRate: form.fixedRate ? Number(form.fixedRate) / 100 : undefined,
        marginRate: form.marginRate ? Number(form.marginRate) / 100 : undefined,
        rateFloor: form.rateFloor ? Number(form.rateFloor) / 100 : undefined,
        rateCeiling: form.rateCeiling ? Number(form.rateCeiling) / 100 : undefined,
        termMonths: Number(form.termMonths),
        borrowers: borrowers.filter((b) => b.borrowerId).map(({ displayName: _, ...b }) => b),
      });
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      setErrors({ loanName: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  const addBorrower = () =>
    setBorrowers((b) => [...b, { borrowerId: '', role: 'CO_BORROWER', displayName: '' }]);
  const removeBorrower = (i: number) => setBorrowers((b) => b.filter((_, idx) => idx !== i));

  return (
    <>
      <style>{FONT}</style>
      <div className="min-h-screen bg-[#0d0d1a] text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
        {/* Header */}
        <div className="border-b border-[#1e1e30] px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-[#1e1e30] transition-colors text-gray-400 hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold">New Loan</h1>
            <p className="text-xs text-gray-500">Create a new loan facility</p>
          </div>
        </div>

        {success && (
          <div className="mx-8 mt-6 bg-green-900/30 border border-green-700/40 rounded-xl px-5 py-4 flex items-center gap-3 text-green-300">
            <CheckCircle size={18} />
            <span className="text-sm font-medium">Loan created — redirecting to dashboard…</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-8 py-6 max-w-4xl mx-auto space-y-8">
          {/* ── Basic info ── */}
          <section>
            <h2 className="text-sm font-semibold text-[#6366f1] uppercase tracking-widest mb-4">
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Loan Name (optional)">
                <Input placeholder="e.g. Working Capital Facility" value={form.loanName} onChange={set('loanName')} />
              </Field>
              <Field label="Commitment Amount (USD)" error={errors.commitmentAmount}>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="500000"
                  value={form.commitmentAmount}
                  onChange={set('commitmentAmount')}
                />
              </Field>
            </div>
          </section>

          {/* ── Interest ── */}
          <section>
            <h2 className="text-sm font-semibold text-[#6366f1] uppercase tracking-widest mb-4">
              Interest Rate
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Interest Type">
                <Select value={form.interestType} onChange={set('interestType')}>
                  <option value="FIXED">Fixed</option>
                  <option value="FLOATING">Floating (SOFR / PRIME)</option>
                </Select>
              </Field>

              {form.interestType === 'FIXED' ? (
                <Field label="Fixed Rate (%)" error={errors.fixedRate}>
                  <Input type="number" min="0" max="100" step="0.001" placeholder="8.500" value={form.fixedRate} onChange={set('fixedRate')} />
                </Field>
              ) : (
                <>
                  <Field label="Index Rate">
                    <Select value={form.indexRateName} onChange={set('indexRateName')}>
                      <option value="SOFR">SOFR</option>
                      <option value="PRIME">Prime Rate</option>
                      <option value="LIBOR">LIBOR (legacy)</option>
                    </Select>
                  </Field>
                  <Field label="Margin (%)" error={errors.marginRate}>
                    <Input type="number" min="0" max="100" step="0.001" placeholder="2.000" value={form.marginRate} onChange={set('marginRate')} />
                  </Field>
                  <Field label="Rate Floor (%)">
                    <Input type="number" min="0" step="0.001" placeholder="0.000" value={form.rateFloor} onChange={set('rateFloor')} />
                  </Field>
                  <Field label="Rate Ceiling (%)">
                    <Input type="number" min="0" step="0.001" placeholder="18.000" value={form.rateCeiling} onChange={set('rateCeiling')} />
                  </Field>
                </>
              )}
            </div>
          </section>

          {/* ── Structure ── */}
          <section>
            <h2 className="text-sm font-semibold text-[#6366f1] uppercase tracking-widest mb-4">
              Loan Structure
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Field label="Payment Frequency">
                <Select value={form.paymentFrequency} onChange={set('paymentFrequency')}>
                  {(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'WEEKLY', 'BIWEEKLY', 'BULLET'] as PaymentFrequency[]).map(
                    (f) => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>,
                  )}
                </Select>
              </Field>
              <Field label="Amortization">
                <Select value={form.amortizationType} onChange={set('amortizationType')}>
                  <option value="LEVEL_PAYMENT">Level Payment</option>
                  <option value="INTEREST_ONLY">Interest Only</option>
                  <option value="STRAIGHT_LINE">Straight Line</option>
                  <option value="BALLOON">Balloon</option>
                </Select>
              </Field>
              <Field label="Term (months)" error={errors.termMonths}>
                <Input type="number" min="1" max="600" placeholder="60" value={form.termMonths} onChange={set('termMonths')} />
              </Field>
            </div>
          </section>

          {/* ── Dates ── */}
          <section>
            <h2 className="text-sm font-semibold text-[#6366f1] uppercase tracking-widest mb-4">Dates</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Field label="Origination Date" error={errors.originationDate}>
                <Input type="date" value={form.originationDate} onChange={set('originationDate')} />
              </Field>
              <Field label="First Payment Date" error={errors.firstPaymentDate}>
                <Input type="date" value={form.firstPaymentDate} onChange={set('firstPaymentDate')} />
              </Field>
              <Field label="Maturity Date (optional)">
                <Input type="date" value={form.maturityDate} onChange={set('maturityDate')} />
                <span className="text-xs text-gray-600">Calculated from term if blank</span>
              </Field>
            </div>
          </section>

          {/* ── Borrowers ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#6366f1] uppercase tracking-widest">Borrowers</h2>
              <button
                type="button"
                onClick={addBorrower}
                className="flex items-center gap-1.5 text-xs text-[#6366f1] hover:text-indigo-300 transition-colors"
              >
                <Plus size={13} /> Add Borrower
              </button>
            </div>
            {errors.borrowers && (
              <p className="text-xs text-red-400 mb-3 flex items-center gap-1">
                <AlertCircle size={11} /> {errors.borrowers}
              </p>
            )}
            <div className="space-y-3">
              {borrowers.map((b, i) => (
                <div key={i} className="grid grid-cols-5 gap-3 items-end bg-[#13132a] rounded-xl p-4 border border-[#2a2a3e]">
                  <div className="col-span-2">
                    <Field label="Borrower ID (UUID)">
                      <Input
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        value={b.borrowerId}
                        onChange={(e) =>
                          setBorrowers((bs) => bs.map((x, idx) => idx === i ? { ...x, borrowerId: e.target.value } : x))
                        }
                      />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Role">
                      <Select
                        value={b.role}
                        onChange={(e) =>
                          setBorrowers((bs) => bs.map((x, idx) => idx === i ? { ...x, role: e.target.value as BorrowerRole } : x))
                        }
                      >
                        <option value="PRIMARY">Primary Borrower</option>
                        <option value="CO_BORROWER">Co-Borrower</option>
                        <option value="GUARANTOR">Guarantor</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="flex justify-end pb-0.5">
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => removeBorrower(i)}
                        className="p-2 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Submit ── */}
          <div className="flex gap-3 pt-4 border-t border-[#1e1e30]">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2.5 rounded-xl border border-[#2a2a3e] text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              className="px-8 py-2.5 rounded-xl bg-[#6366f1] hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Loan'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

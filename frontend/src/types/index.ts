// ── Enums (mirror backend) ────────────────────────────────────────────────────
export type LoanStatus =
  | 'PENDING' | 'APPROVED' | 'ACTIVE' | 'DELINQUENT'
  | 'DEFAULT' | 'PAID_OFF' | 'CHARGED_OFF' | 'CLOSED';

export type InterestType = 'FIXED' | 'FLOATING';
export type PaymentFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'BULLET';
export type AmortizationType = 'LEVEL_PAYMENT' | 'INTEREST_ONLY' | 'STRAIGHT_LINE' | 'BALLOON';
export type ScheduleItemStatus = 'SCHEDULED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';
export type DisbursementStatus = 'PENDING' | 'APPROVED' | 'DISBURSED' | 'CANCELLED';
export type FeeType = 'ORIGINATION' | 'LATE_PAYMENT' | 'PREPAYMENT' | 'NSF' | 'MODIFICATION' | 'OTHER';
export type FeeStatus = 'OUTSTANDING' | 'PAID' | 'WAIVED';
export type PaymentBucket = 'PRINCIPAL' | 'INTEREST' | 'FEE' | 'PREPAYMENT';
export type BorrowerType = 'INDIVIDUAL' | 'ENTITY';

// ── Domain types ──────────────────────────────────────────────────────────────
export interface Borrower {
  id: string;
  tenantId: string;
  borrowerType: BorrowerType;
  displayName: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  tenantId: string;
  loanNumber: string;
  loanName?: string;
  status: LoanStatus;
  commitmentAmount: string;
  outstandingBalance: string;
  accruedInterest: string;
  interestType: InterestType;
  fixedRate?: string;
  indexRateName?: string;
  marginRate?: string;
  indexRate?: string;
  paymentFrequency: PaymentFrequency;
  amortizationType: AmortizationType;
  termMonths: number;
  originationDate: string;
  firstPaymentDate: string;
  maturityDate: string;
  daysPastDue: number;
  nextPaymentDate?: string;
  nextPaymentAmount?: string;
  lastPaymentDate?: string;
  borrowers: Borrower[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleItem {
  id: string;
  loanId: string;
  periodNumber: number;
  dueDate: string;
  status: ScheduleItemStatus;
  principalDue: string;
  interestDue: string;
  feesDue: string;
  principalPaid: string;
  interestPaid: string;
  feesPaid: string;
  beginningBalance: string;
  endingBalance: string;
}

export interface PaymentAllocation {
  id: string;
  bucket: PaymentBucket;
  amount: string;
  scheduleItemId?: string;
  feeId?: string;
}

export interface Payment {
  id: string;
  loanId: string;
  paymentDate: string;
  amount: string;
  reference?: string;
  reversed: boolean;
  reversedAt?: string;
  allocations: PaymentAllocation[];
  createdAt: string;
}

export interface Disbursement {
  id: string;
  loanId: string;
  status: DisbursementStatus;
  amount: string;
  fees: string;
  disbursementDate?: string;
  approvedAt?: string;
  reference?: string;
  createdAt: string;
}

export interface Fee {
  id: string;
  loanId: string;
  feeType: FeeType;
  status: FeeStatus;
  amount: string;
  amountPaid: string;
  assessedDate: string;
  dueDate?: string;
  description?: string;
}

// ── API response wrappers ─────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; pages: number };
}

export interface DelinquencyReport {
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  total_delinquent: number;
  total_delinquent_balance: string;
}

export interface ActiveLoansReport {
  total_loans: number;
  total_commitment: string;
  total_outstanding: string;
  total_accrued_interest: string;
  by_status: Array<{ status: LoanStatus; count: number; outstanding: string }>;
  by_interest_type: Array<{ type: InterestType; count: number }>;
}

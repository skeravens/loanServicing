export enum LoanStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  DELINQUENT = 'DELINQUENT',
  DEFAULT = 'DEFAULT',
  PAID_OFF = 'PAID_OFF',
  CHARGED_OFF = 'CHARGED_OFF',
  CLOSED = 'CLOSED',
}

export enum InterestType {
  FIXED = 'FIXED',
  FLOATING = 'FLOATING',
}

export enum PaymentFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
  BULLET = 'BULLET',
}

export enum AmortizationType {
  LEVEL_PAYMENT = 'LEVEL_PAYMENT',
  INTEREST_ONLY = 'INTEREST_ONLY',
  STRAIGHT_LINE = 'STRAIGHT_LINE',
  BALLOON = 'BALLOON',
}

export enum ScheduleItemStatus {
  SCHEDULED = 'SCHEDULED',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  WAIVED = 'WAIVED',
}

export enum DisbursementStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DISBURSED = 'DISBURSED',
  CANCELLED = 'CANCELLED',
}

export enum FeeType {
  ORIGINATION = 'ORIGINATION',
  LATE_PAYMENT = 'LATE_PAYMENT',
  PREPAYMENT = 'PREPAYMENT',
  NSF = 'NSF',
  MODIFICATION = 'MODIFICATION',
  OTHER = 'OTHER',
}

export enum FeeStatus {
  OUTSTANDING = 'OUTSTANDING',
  PAID = 'PAID',
  WAIVED = 'WAIVED',
}

export enum PaymentAllocationBucket {
  PRINCIPAL = 'PRINCIPAL',
  INTEREST = 'INTEREST',
  FEE = 'FEE',
  PREPAYMENT = 'PREPAYMENT',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum BorrowerType {
  INDIVIDUAL = 'INDIVIDUAL',
  ENTITY = 'ENTITY',
}

export enum LoanBorrowerRole {
  PRIMARY = 'PRIMARY',
  CO_BORROWER = 'CO_BORROWER',
  GUARANTOR = 'GUARANTOR',
}

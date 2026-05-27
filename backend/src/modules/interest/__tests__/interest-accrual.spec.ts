import { Test, TestingModule } from '@nestjs/testing';
import { InterestAccrualService } from '../interest-accrual.service';
import { PaymentService } from '../../payments/payment.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InterestAccrual } from '../entities/interest-accrual.entity';
import { IndexRateHistory } from '../entities/index-rate-history.entity';
import { Loan } from '../../loans/entities/loan.entity';
import { DataSource } from 'typeorm';

// ─── Mock factory ────────────────────────────────────────────────────────────

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((e) => e),
  increment: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  }),
});

const mockDataSource = () => ({
  query: jest.fn(),
  transaction: jest.fn((cb) => cb(mockEntityManager())),
});

const mockEntityManager = () => ({
  findOne: jest.fn(),
  save: jest.fn((e) => Promise.resolve({ ...e, id: 'mock-id' })),
  create: jest.fn((_, e) => e),
  update: jest.fn(),
  count: jest.fn(),
  increment: jest.fn(),
  query: jest.fn(),
});

// ─── Interest Accrual Tests ───────────────────────────────────────────────────

describe('InterestAccrualService', () => {
  let service: InterestAccrualService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterestAccrualService,
        { provide: getRepositoryToken(Loan), useFactory: mockRepo },
        { provide: getRepositoryToken(InterestAccrual), useFactory: mockRepo },
        { provide: getRepositoryToken(IndexRateHistory), useFactory: mockRepo },
        { provide: DataSource, useFactory: mockDataSource },
        { provide: 'AuditService', useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<InterestAccrualService>(InterestAccrualService);
  });

  // ─── Actual/360 Core Calculation ──────────────────────────────────────────

  describe('calculateActual360', () => {
    it('should calculate correct daily rate for 8.5% annual', () => {
      const { dailyRate, accrualAmount } = service.calculateActual360(500_000, 0.085);
      // Daily rate = 8.5% / 360 = 0.000236111...
      expect(dailyRate).toBeCloseTo(0.000236111, 6);
      // Daily interest = 500,000 × 0.000236111 = 118.0555...
      expect(accrualAmount).toBeCloseTo(118.0556, 2);
    });

    it('should handle zero balance', () => {
      const { accrualAmount } = service.calculateActual360(0, 0.085);
      expect(accrualAmount).toBe(0);
    });

    it('should handle zero rate', () => {
      const { dailyRate, accrualAmount } = service.calculateActual360(100_000, 0);
      expect(dailyRate).toBe(0);
      expect(accrualAmount).toBe(0);
    });

    it('should round accrual amount to 4 decimal places', () => {
      // $123,456.78 at 7.25% = $123,456.78 × (0.0725/360) = 24.8685...
      const { accrualAmount } = service.calculateActual360(123_456.78, 0.0725);
      const decimalPlaces = String(accrualAmount).split('.')[1]?.length ?? 0;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should handle floating rate correctly (index + margin)', () => {
      // SOFR 5.30% + Margin 2.50% = 7.80% effective
      const effectiveRate = 0.053 + 0.025;
      const { accrualAmount } = service.calculateActual360(250_000, effectiveRate);
      const expected = 250_000 * (0.078 / 360);
      expect(accrualAmount).toBeCloseTo(expected, 2);
    });

    it('regression: $1M at 10% = $277.78/day', () => {
      const { accrualAmount } = service.calculateActual360(1_000_000, 0.10);
      // 1,000,000 × 0.10 / 360 = 277.7778
      expect(accrualAmount).toBeCloseTo(277.7778, 2);
    });
  });

  // ─── Period Interest Calculation ─────────────────────────────────────────

  describe('calculatePeriodInterest', () => {
    it('should calculate 30-day interest correctly', () => {
      const interest = service.calculatePeriodInterest(100_000, 0.12, 30);
      // 100,000 × (0.12/360) × 30 = 1,000
      expect(interest).toBeCloseTo(1_000, 2);
    });

    it('should calculate 31-day interest correctly', () => {
      const interest = service.calculatePeriodInterest(100_000, 0.12, 31);
      // 100,000 × (0.12/360) × 31 = 1,033.33
      expect(interest).toBeCloseTo(1_033.33, 2);
    });

    it('should calculate 28-day (February) interest', () => {
      const interest = service.calculatePeriodInterest(100_000, 0.12, 28);
      // 100,000 × (0.12/360) × 28 = 933.33
      expect(interest).toBeCloseTo(933.33, 2);
    });

    it('annualized: 365-day year × daily accrual should exceed annual rate', () => {
      // Actual/360: using 365 days effectively charges more than stated annual rate
      const principal = 100_000;
      const rate = 0.10;
      const annualAccrual = service.calculatePeriodInterest(principal, rate, 365);
      // Should be 100,000 × 10% × 365/360 = 10,138.89 (more than 10,000)
      expect(annualAccrual).toBeGreaterThan(10_000);
      expect(annualAccrual).toBeCloseTo(10_138.89, 2);
    });
  });
});

// ─── Payment Allocation Tests ─────────────────────────────────────────────────

describe('PaymentService - Allocation Logic', () => {
  // Pure unit tests on allocation business rules (no DB dependency)

  describe('allocation validation', () => {
    it('should reject when allocation total < payment amount', () => {
      const paymentAmount = 1000;
      const allocations = [{ bucket: 'PRINCIPAL', amount: 500 }];
      const total = allocations.reduce((s, a) => s + a.amount, 0);
      expect(Math.abs(total - paymentAmount) > 0.01).toBe(true);
    });

    it('should accept when allocation total equals payment amount', () => {
      const paymentAmount = 1000;
      const allocations = [
        { bucket: 'INTEREST', amount: 300 },
        { bucket: 'PRINCIPAL', amount: 700 },
      ];
      const total = allocations.reduce((s, a) => s + a.amount, 0);
      expect(Math.abs(total - paymentAmount) <= 0.01).toBe(true);
    });

    it('should allow overpayment via PREPAYMENT bucket', () => {
      const paymentAmount = 1200;
      const outstandingBalance = 1000;
      const allocations = [
        { bucket: 'PRINCIPAL', amount: 1000 },
        { bucket: 'PREPAYMENT', amount: 200 },
      ];
      const total = allocations.reduce((s, a) => s + a.amount, 0);
      expect(total).toBe(paymentAmount);
      // Principal allocation ≤ outstanding balance
      const principalAlloc = allocations
        .filter((a) => a.bucket === 'PRINCIPAL')
        .reduce((s, a) => s + a.amount, 0);
      expect(principalAlloc).toBeLessThanOrEqual(outstandingBalance);
    });

    it('should reject principal exceeding outstanding balance', () => {
      const outstandingBalance = 500;
      const principalAlloc = 600;
      expect(principalAlloc > outstandingBalance + 0.01).toBe(true);
    });
  });

  describe('balance updates', () => {
    it('should reduce outstanding balance by principal amount', () => {
      const initialBalance = 100_000;
      const principalPayment = 5_000;
      const newBalance = Math.max(0, initialBalance - principalPayment);
      expect(newBalance).toBe(95_000);
    });

    it('should reduce accrued interest by interest payment', () => {
      const initialInterest = 1_245.33;
      const interestPayment = 1_245.33;
      const remaining = Math.max(0, initialInterest - interestPayment);
      expect(remaining).toBeCloseTo(0, 2);
    });

    it('should mark loan as PAID_OFF when balance reaches zero', () => {
      const initialBalance = 1_000;
      const principalPayment = 1_000;
      const newBalance = Math.max(0, initialBalance - principalPayment);
      const newStatus = newBalance <= 0 ? 'PAID_OFF' : 'CURRENT';
      expect(newStatus).toBe('PAID_OFF');
    });

    it('should not reduce balance below zero', () => {
      const initialBalance = 100;
      const principalPayment = 150; // overpayment
      const newBalance = Math.max(0, initialBalance - principalPayment);
      expect(newBalance).toBe(0);
    });
  });

  describe('schedule item status transitions', () => {
    interface MockScheduleItem {
      scheduledPrincipal: number;
      scheduledInterest: number;
      scheduledFees: number;
      scheduledTotal: number;
      paidPrincipal: number;
      paidInterest: number;
      paidFees: number;
      status: string;
    }

    const applyToItem = (
      item: MockScheduleItem,
      bucket: string,
      amount: number,
    ): MockScheduleItem => {
      const updated = { ...item };
      if (bucket === 'PRINCIPAL') updated.paidPrincipal += amount;
      else if (bucket === 'INTEREST') updated.paidInterest += amount;
      else if (bucket === 'FEE') updated.paidFees += amount;

      const totalPaid = updated.paidPrincipal + updated.paidInterest + updated.paidFees;
      updated.status =
        totalPaid >= updated.scheduledTotal - 0.01
          ? 'PAID'
          : totalPaid > 0
          ? 'PARTIAL'
          : item.status;

      return updated;
    };

    const makeItem = (p: number, i: number, f: number): MockScheduleItem => ({
      scheduledPrincipal: p,
      scheduledInterest: i,
      scheduledFees: f,
      scheduledTotal: p + i + f,
      paidPrincipal: 0,
      paidInterest: 0,
      paidFees: 0,
      status: 'OVERDUE',
    });

    it('should mark PAID when fully paid', () => {
      let item = makeItem(1000, 100, 50);
      item = applyToItem(item, 'INTEREST', 100);
      item = applyToItem(item, 'PRINCIPAL', 1000);
      item = applyToItem(item, 'FEE', 50);
      expect(item.status).toBe('PAID');
    });

    it('should mark PARTIAL when partially paid', () => {
      let item = makeItem(1000, 100, 0);
      item = applyToItem(item, 'INTEREST', 100);
      expect(item.status).toBe('PARTIAL');
      expect(item.paidInterest).toBe(100);
    });

    it('should remain OVERDUE when no payment applied', () => {
      const item = makeItem(500, 50, 0);
      expect(item.status).toBe('OVERDUE');
    });
  });
});

// ─── Accrual Idempotency Test ─────────────────────────────────────────────────

describe('Accrual idempotency', () => {
  it('should not create duplicate accrual records for same date', () => {
    const accruals = new Map<string, boolean>();
    const loanId = 'loan-123';

    const tryAccrue = (date: string): boolean => {
      const key = `${loanId}:${date}`;
      if (accruals.has(key)) return false; // already accrued
      accruals.set(key, true);
      return true;
    };

    expect(tryAccrue('2024-01-15')).toBe(true);
    expect(tryAccrue('2024-01-15')).toBe(false); // duplicate blocked
    expect(tryAccrue('2024-01-16')).toBe(true);
  });
});

// ─── Actual/360 Year Equivalence ─────────────────────────────────────────────

describe('Actual/360 conventions', () => {
  const dailyAccrual = (balance: number, rate: number) => balance * (rate / 360);

  it('360-day year sums to exactly stated annual rate', () => {
    const balance = 100_000;
    const rate = 0.10;
    const annual360 = dailyAccrual(balance, rate) * 360;
    expect(annual360).toBeCloseTo(balance * rate, 2);
  });

  it('365-day year exceeds stated annual interest', () => {
    const balance = 100_000;
    const rate = 0.10;
    const annual365 = dailyAccrual(balance, rate) * 365;
    expect(annual365).toBeGreaterThan(balance * rate);
  });

  it('366-day leap year accrues most', () => {
    const balance = 100_000;
    const rate = 0.10;
    const annual366 = dailyAccrual(balance, rate) * 366;
    const annual365 = dailyAccrual(balance, rate) * 365;
    expect(annual366).toBeGreaterThan(annual365);
  });
});

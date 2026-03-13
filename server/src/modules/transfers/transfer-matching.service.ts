import type { Transaction } from "@txls/shared";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";

export interface TransferMatch {
  withdrawalId: number;
  depositId: number;
  asset: string;
  quantity: number;
  withdrawalTimestamp: DateTime;
  depositTimestamp: DateTime;
}

export interface MatchResult {
  matches: TransferMatch[];
  unmatchedWithdrawals: Transaction[];
  unmatchedDeposits: Transaction[];
}

const TIME_WINDOW_HOURS = 48;
const QUANTITY_TOLERANCE = 0.0001;

export class TransferMatchingService {
  constructor(private dataSource: DataSource) {}

  async matchTransfersForUser(userId: number): Promise<{ matched: number }> {
    const repository = new TransactionsRepository(this.dataSource);
    const entities = await repository.findByUserId(userId);
    const transactions = entities.map((e) => e as unknown as Transaction);
    const matches = this.findMatches(transactions);

    for (const match of matches) {
      await repository.updateLinkedTransaction(
        userId,
        match.withdrawalId,
        match.depositId
      );

      const withdrawal = entities.find((t) => t.id === match.withdrawalId);
      if (withdrawal) {
        const { timestamp, eurValue } = this.getOriginalValues(withdrawal, entities);
        
        await repository.updateLinkedTransaction(
          userId,
          match.depositId,
          match.withdrawalId,
          timestamp,
          eurValue
        );
      }
    }

    return { matched: matches.length };
  }

  private getOriginalValues(
    withdrawal: TransactionEntity,
    allTransactions: TransactionEntity[]
  ): { timestamp: number; eurValue: number } {
    if (withdrawal.originalAcquisitionTimestamp && withdrawal.originalEurValue !== undefined && withdrawal.originalEurValue !== null) {
      const ts = withdrawal.originalAcquisitionTimestamp;
      return {
        timestamp: typeof ts === "number" ? ts : ts.toMillis(),
        eurValue: withdrawal.originalEurValue,
      };
    }

    const sourceDeposit = allTransactions.find(
      (t) =>
        t.type === "deposit" &&
        t.providerAccountId === withdrawal.providerAccountId &&
        t.asset === withdrawal.asset &&
        t.timestamp < withdrawal.timestamp &&
        t.originalAcquisitionTimestamp &&
        t.originalEurValue !== undefined &&
        t.originalEurValue !== null
    );

    if (sourceDeposit && sourceDeposit.originalAcquisitionTimestamp) {
      const ts = sourceDeposit.originalAcquisitionTimestamp;
      return {
        timestamp: typeof ts === "number" ? ts : ts.toMillis(),
        eurValue: sourceDeposit.originalEurValue ?? sourceDeposit.eurValue,
      };
    }

    return {
      timestamp: withdrawal.timestamp.toMillis(),
      eurValue: withdrawal.eurValue,
    };
  }

  findMatches(transactions: Transaction[]): TransferMatch[] {
    const withdrawals = transactions.filter(
      (t) => t.type === "withdrawal" && !(t as any).linkedTransactionId
    );
    const deposits = transactions.filter(
      (t) => t.type === "deposit" && !(t as any).linkedTransactionId
    );

    const matches: TransferMatch[] = [];
    const matchedDepositIds = new Set<number>();

    for (const withdrawal of withdrawals) {
      const candidateDeposits = deposits.filter((deposit) => {
        if (matchedDepositIds.has(deposit.id)) return false;
        if (deposit.providerAccountId === withdrawal.providerAccountId) return false;
        return this.canMatch(withdrawal, deposit);
      });

      if (candidateDeposits.length === 1) {
        const deposit = candidateDeposits[0];
        matches.push(this.createMatch(withdrawal, deposit));
        matchedDepositIds.add(deposit.id);
      } else if (candidateDeposits.length > 1) {
        candidateDeposits.sort((a, b) => {
          const diffA = Math.abs(a.timestamp.toMillis() - withdrawal.timestamp.toMillis());
          const diffB = Math.abs(b.timestamp.toMillis() - withdrawal.timestamp.toMillis());
          return diffA - diffB;
        });
        const deposit = candidateDeposits[0];
        matches.push(this.createMatch(withdrawal, deposit));
        matchedDepositIds.add(deposit.id);
      }
    }

    return matches;
  }

  getUnmatchedWithdrawals(transactions: Transaction[]): Transaction[] {
    const matches = this.findMatches(transactions);
    const matchedWithdrawalIds = new Set(matches.map((m) => m.withdrawalId));

    return transactions.filter(
      (t) =>
        t.type === "withdrawal" &&
        !(t as any).linkedTransactionId &&
        !matchedWithdrawalIds.has(t.id)
    );
  }

  getUnmatchedDeposits(transactions: Transaction[]): Transaction[] {
    const matches = this.findMatches(transactions);
    const matchedDepositIds = new Set(matches.map((m) => m.depositId));

    return transactions.filter(
      (t) =>
        t.type === "deposit" &&
        !(t as any).linkedTransactionId &&
        !matchedDepositIds.has(t.id)
    );
  }

  private canMatch(withdrawal: Transaction, deposit: Transaction): boolean {
    if (withdrawal.asset !== deposit.asset) return false;

    const quantityDiff = Math.abs(withdrawal.quantity - deposit.quantity);
    if (quantityDiff > QUANTITY_TOLERANCE) return false;

    const timeDiffMs = Math.abs(
      deposit.timestamp.toMillis() - withdrawal.timestamp.toMillis()
    );
    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
    if (timeDiffHours > TIME_WINDOW_HOURS) return false;

    return true;
  }

  private createMatch(withdrawal: Transaction, deposit: Transaction): TransferMatch {
    return {
      withdrawalId: withdrawal.id,
      depositId: deposit.id,
      asset: withdrawal.asset,
      quantity: withdrawal.quantity,
      withdrawalTimestamp: withdrawal.timestamp,
      depositTimestamp: deposit.timestamp,
    };
  }
}

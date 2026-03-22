import "reflect-metadata";
import { injectable, inject } from "inversify";
import { Between, DataSource } from "typeorm";
import type { Transaction } from "@txls/shared";
import { TYPES } from "../di/types.js";
import { TransactionEntity } from "../modules/transactions/transaction.entity.js";
import { logger } from "../common/logger.js";

interface ImportDeduplicationResult {
  shouldSkip: boolean;
  existingSum?: number;
  newSum?: number;
  existingQuantitySum?: number;
  newQuantitySum?: number;
  count: number;
}

interface ImportRange {
  minTimestamp: number;
  maxTimestamp: number;
}

@injectable()
export class ImportDeduplicationService {
  private userId?: number;

  constructor(
    @inject(TYPES.DataSource) private dataSource: DataSource,
  ) {}

  setUserId(userId: number | undefined): void {
    this.userId = userId;
  }

  async shouldSkipOrReplace(
    accountId: number,
    transactions: Transaction[],
  ): Promise<ImportDeduplicationResult> {
    if (transactions.length === 0) {
      return {
        shouldSkip: true,
        count: 0,
      };
    }

    const range = this.calculateImportRange(transactions);

    logger.info({
      accountId,
      message: "Calculating deduplication for import",
      importRange: {
        min: new Date(range.minTimestamp).toISOString(),
        max: new Date(range.maxTimestamp).toISOString(),
      },
      transactionCount: transactions.length,
    });

    const existingTransactions = await this.fetchExistingInRange(
      accountId,
      range,
    );

    const existingSum = existingTransactions.reduce(
      (sum, tx) => sum + Math.abs(Number(tx.eurValue)),
      0,
    );
    const newSum = transactions.reduce(
      (sum, tx) => sum + Math.abs(tx.eurValue),
      0,
    );
    const existingQuantitySum = existingTransactions.reduce(
      (sum, tx) => sum + Math.abs(Number(tx.quantity)),
      0,
    );
    const newQuantitySum = transactions.reduce(
      (sum, tx) => sum + Math.abs(tx.quantity),
      0,
    );
    const existingCount = existingTransactions.length;

    logger.info({
      accountId,
      message: "Deduplication comparison",
      existingCount,
      newCount: transactions.length,
      existingSum,
      newSum,
      existingQuantitySum,
      newQuantitySum,
      sumsMatch: existingSum === newSum && existingQuantitySum === newQuantitySum,
    });

    if (existingSum === newSum && existingQuantitySum === newQuantitySum && existingCount === transactions.length) {
      logger.info({
        accountId,
        message: "Skipping import - data matches existing records",
      });
      return {
        shouldSkip: true,
        existingSum,
        newSum,
        existingQuantitySum,
        newQuantitySum,
        count: existingCount,
      };
    }

    logger.info({
      accountId,
      message: "Data mismatch - will replace existing data",
      existingCount,
    });

    await this.removeExistingInRange(accountId, range);

    logger.info({
      accountId,
      message: "Removed existing transactions in range",
      removedCount: existingCount,
    });

    return {
      shouldSkip: false,
      existingSum,
      newSum,
      existingQuantitySum,
      newQuantitySum,
      count: existingCount,
    };
  }

  private calculateImportRange(transactions: Transaction[]): ImportRange {
    const timestamps = transactions.map((t) => t.timestamp.toMillis());

    return {
      minTimestamp: Math.min(...timestamps),
      maxTimestamp: Math.max(...timestamps),
    };
  }

  private async fetchExistingInRange(
    accountId: number,
    { minTimestamp, maxTimestamp }: ImportRange,
  ): Promise<TransactionEntity[]> {
    const repository = this.dataSource.getRepository(TransactionEntity);

    const whereConditions: any = {
      providerAccountId: accountId,
    };

    if (this.userId !== undefined) {
      whereConditions.userId = this.userId;
    }

    const transactions = await repository
      .createQueryBuilder("transaction")
      .where("transaction.providerAccountId = :accountId AND transaction.userId = COALESCE(:userId, transaction.userId)", { accountId, userId: this.userId })
      .andWhere("transaction.timestamp BETWEEN :minTimestamp AND :maxTimestamp", {
        minTimestamp,
        maxTimestamp,
      })
      .orderBy("transaction.timestamp", "ASC")
      .getMany();

    logger.debug({
      accountId,
      message: "Fetched existing transactions in range",
      count: transactions.length,
      range: {
        min: new Date(minTimestamp).toISOString(),
        max: new Date(maxTimestamp).toISOString(),
      },
    });

    return transactions;
  }

  private async removeExistingInRange(
    accountId: number,
    { minTimestamp, maxTimestamp }: ImportRange,
  ): Promise<void> {
    const qb = this.dataSource
      .createQueryBuilder()
      .delete()
      .from(TransactionEntity)
      .where("providerAccountId = :accountId AND userId = COALESCE(:userId, userId)", { accountId, userId: this.userId })
      .andWhere("timestamp BETWEEN :minTimestamp AND :maxTimestamp", {
        minTimestamp,
        maxTimestamp,
      });

    const result = await qb.execute();

    logger.debug({
      accountId,
      message: "Deleted existing transactions in range",
      affected: result.affected || 0,
    });
  }
}

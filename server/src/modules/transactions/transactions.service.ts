import "reflect-metadata";
import type { Transaction } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import type { AssetStat, YearStats } from "@txls/shared";
import { TransactionEntity } from "./transaction.entity.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { logger } from "../../common/logger.js";

export class TransactionsService {
  private readonly repository: TransactionsRepository;

  constructor(repository: TransactionsRepository) {
    this.repository = repository;
  }

  async findByProviderAccountId(userId: number, providerAccountId: number): Promise<Transaction[]> {
    logger.info({
      message: "Finding transactions for provider account",
      userId,
      providerAccountId,
    });

    try {
      const entities = await this.repository.findByProviderAccountId(userId, providerAccountId);

      logger.info({
        message: "Found transactions",
        providerAccountId,
        count: entities.length,
      });

      return entities.map((entity) => this.entityToSchema(entity));
    } catch (error) {
      logger.error({
        message: "Failed to find transactions",
        providerAccountId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByProviderAccountIdWithStats(
    userId: number,
    providerAccountId: number,
    year?: number,
  ): Promise<{
    transactions: Transaction[];
    stats: YearStats;
  }> {
    logger.info({
      message: "Finding transactions for provider account with stats",
      userId,
      providerAccountId,
      year,
    });

    try {
      const yearToQuery = year ?? new Date().getFullYear();

      const entities = await this.repository.findByProviderAccountIdAndYear(
        userId,
        providerAccountId,
        yearToQuery,
      );

      const stats = await this.repository.getStatsByProviderAccountIdAndYear(
        userId,
        providerAccountId,
        yearToQuery,
      );

      logger.info({
        message: "Found transactions with stats",
        providerAccountId,
        year: yearToQuery,
        count: entities.length,
        stakingIncome: stats.staking.fiatAmount,
        buysCount: stats.buys.count,
        sellsCount: stats.sells.count,
      });

      return {
        transactions: entities.map((entity) => this.entityToSchema(entity)),
        stats,
      };
    } catch (error) {
      logger.error({
        message: "Failed to find transactions with stats",
        providerAccountId,
        year,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async importTransactions(
    providerAccountId: number,
    transactions: Transaction[],
  ): Promise<{ imported: number; errors: string[] }> {
    logger.info({
      message: "Starting transaction import",
      providerAccountId,
      transactionCount: transactions.length,
    });

    const errors: string[] = [];
    let imported = 0;

    for (const transaction of transactions) {
      try {
        const existing = await this.repository.findOneByExternalId(
          transaction.externalId,
        );

        if (existing) {
          const msg = `Transaction ${transaction.externalId} already exists`;
          errors.push(msg);
          logger.warn({
            message: "Duplicate transaction",
            providerAccountId,
            externalId: transaction.externalId,
          });
          continue;
        }

        const entity = this.dtoToEntity(transaction, providerAccountId);
        await this.repository.save(entity);

        imported++;
        logger.debug({
          message: "Transaction saved successfully",
          providerAccountId,
          externalId: transaction.externalId,
          type: transaction.type,
          asset: transaction.asset,
        });
      } catch (error) {
        const msg = `Error importing transaction ${transaction.externalId}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        errors.push(msg);
        logger.error({
          message: "Failed to import transaction",
          providerAccountId,
          externalId: transaction.externalId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    logger.info({
      message: "Transaction import completed",
      providerAccountId,
      imported,
      errors: errors.length,
    });

    return { imported, errors };
  }

  private entityToSchema(entity: TransactionEntity): Transaction {
    return {
      id: entity.id,
      providerAccountId: entity.providerAccountId,
      externalId: entity.externalId,
      timestamp: entity.timestamp,
      type: entity.type as TransactionType,
      asset: entity.asset,
      quantity: Number(entity.quantity),
      eurValue: Number(entity.eurValue),
      eurFee: Number(entity.eurFee),
      processed: entity.processed,
    };
  }

  private dtoToEntity(dto: Transaction, providerAccountId: number): TransactionEntity {
    const entity = new TransactionEntity();
    entity.providerAccountId = providerAccountId;
    entity.externalId = dto.externalId;
    entity.timestamp = dto.timestamp;
    entity.type = dto.type as string;
    entity.asset = dto.asset;
    entity.quantity = dto.quantity;
    entity.eurValue = dto.eurValue;
    entity.eurFee = dto.eurFee;
    entity.processed = dto.processed;
    return entity;
  }
}

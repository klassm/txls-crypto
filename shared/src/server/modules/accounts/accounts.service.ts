import "reflect-metadata";
import type { Account, CreateAccountDto, UpdateAccountDto } from "../../../types/index.js";
import { ProviderType } from "../../../types/index.js";
import { AccountEntity } from "./account.entity.js";
import { AccountsRepository } from "./accounts.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { logger } from "../../common/logger.js";
import { sources } from "../../sources/registry.js";

const providerMetadata: { [key in ProviderType]: any } = {
  [ProviderType.Bitpanda]: sources.bitpanda,
  [ProviderType.TradeRepublic]: sources.tradeRepublic,
};

export class AccountsService {
  private readonly repository: AccountsRepository;
  private readonly transactionsRepository: TransactionsRepository;

  constructor(
    repository?: AccountsRepository,
    dataSource?: any,
    transactionsRepository?: TransactionsRepository,
  ) {
    if (repository) {
      this.repository = repository;
    } else if (dataSource) {
      this.repository = new AccountsRepository(dataSource);
    } else {
      throw new Error("Either repository or dataSource must be provided");
    }

    this.transactionsRepository =
      transactionsRepository || new TransactionsRepository(dataSource ?? this["repository"]["dataSource"]);
  }

  async findAll(userId: number): Promise<Account[]> {
    try {
      const entities = await this.repository.findAll(userId);
      const assetSummaries =
        await this.transactionsRepository.getAllAssetSummaries(userId);

      return entities.map((entity) => {
        const account = this.entityToSchema(entity);
        account.assets = assetSummaries.get(entity.id) || [];
        return account;
      });
    } catch (error) {
      logger.error({
        message: "Failed to find accounts",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findById(userId: number, id: number): Promise<Account | null> {
    try {
      const entity = await this.repository.findById(userId, id);
      if (!entity) return null;

      const account = this.entityToSchema(entity);
      account.assets = await this.transactionsRepository.getAssetSummaryByProviderAccountId(userId, id);

      return account;
    } catch (error) {
      logger.error({
        message: "Failed to find account",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(userId: number, data: CreateAccountDto): Promise<Account> {
    try {
      const entity = new AccountEntity();
      entity.userId = userId;
      entity.provider = data.provider || data.type || ProviderType.Bitpanda;

      const saved = await this.repository.save(entity);

      logger.info({
        message: "Account created successfully",
        id: saved.id,
        provider: saved.provider,
      });

      return this.entityToSchema(saved);
    } catch (error) {
      logger.error({
        message: "Failed to create account",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(userId: number, id: number, data: UpdateAccountDto): Promise<Account> {
    try {
      const entity = await this.repository.findById(userId, id);
      if (!entity) {
        throw new Error("Account not found");
      }

if (data.provider !== undefined) {
entity.provider = data.provider || entity.provider || ProviderType.Bitpanda;
}

      const saved = await this.repository.save(entity);

      logger.info({
        message: "Account updated successfully",
        id: saved.id,
        provider: saved.provider,
      });

      return this.entityToSchema(saved);
    } catch (error) {
      logger.error({
        message: "Failed to update account",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(userId: number, id: number): Promise<void> {
    const exists = await this.repository.exists(userId, id);
    if (!exists) {
      throw new Error("Account not found");
    }

    try {
      await this.repository.delete(id);

      logger.info({
        message: "Account deleted successfully",
        id,
      });
    } catch (error) {
      logger.error({
        message: "Failed to delete account",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private entityToSchema(entity: AccountEntity): Account {
    const providerKey = Object.values(ProviderType).find(
      (p) => p.toLowerCase() === entity.provider.toLowerCase()
    );
    if (!providerKey) {
      throw new Error(`Unknown provider: ${entity.provider}`);
    }
    const metadata = providerMetadata[providerKey];
    return {
      id: entity.id,
      userId: entity.userId,
      provider: providerKey,
      type: providerKey,
      name: metadata.name,
      logoBackgroundColor: metadata.logoBackgroundColor,
      logoForegroundColor: metadata.logoForegroundColor,
      logoPath: metadata.logoPath,
      csvImportMarkdownInstructions: metadata.csvImportMarkdownInstructions,
      csvImportAllowed: true,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

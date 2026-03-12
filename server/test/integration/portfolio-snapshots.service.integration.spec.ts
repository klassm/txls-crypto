import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { getDataSource } from "../../src/database.js";
import { PortfolioSnapshotsService } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.service.js";
import { PortfolioSnapshotsRepository } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.repository.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { DateTime } from "luxon";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";
import { TransactionType, ProviderType } from "@txls/shared";

describe("PortfolioSnapshotsService Integration Tests", () => {
	let service: PortfolioSnapshotsService;
	let dataSource: Awaited<ReturnType<typeof getDataSource>>;

	afterAll(async () => {
		await destroyTestDataSource();
	});

	beforeEach(async () => {
		await createTestDataSource();
		dataSource = await getDataSource();
		service = new PortfolioSnapshotsService(
			dataSource,
			new PortfolioSnapshotsRepository(dataSource),
			new PricesRepository(dataSource)
		);

		await dataSource.getRepository(TransactionEntity).clear();
		await dataSource.getRepository(AccountEntity).clear();
		await dataSource.getRepository(AssetPriceEntity).clear();
	});

	describe("getPortfolioOverview", () => {
		it("should correctly aggregate holdings from multiple accounts with same asset", async () => {
			const today = DateTime.utc().startOf("day");
			const yesterday = today.minus({ days: 1 });

			const account1 = new AccountEntity();
			account1.id = 1;
			account1.userId = 1;
			account1.provider = ProviderType.Bitpanda;
			account1.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account1);

			const account2 = new AccountEntity();
			account2.id = 2;
			account2.userId = 1;
			account2.provider = ProviderType.Bitpanda;
			account2.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account2);

			await dataSource.getRepository(TransactionEntity).save([
				{ userId: 1, providerAccountId: 1, externalId: "tx1", asset: "BTC", type: TransactionType.buy, quantity: 0.5, eurValue: 25000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
				{ userId: 1, providerAccountId: 2, externalId: "tx2", asset: "BTC", type: TransactionType.buy, quantity: 0.3, eurValue: 15000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
			]);

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "BTC", priceEur: 50000, fetchedAt: yesterday } as AssetPriceEntity,
				{ asset: "BTC", priceEur: 55000, fetchedAt: today } as AssetPriceEntity,
			]);

			await service.rebuildAll(1, 1);
			await service.rebuildAll(1, 2);

			const result = await service.getPortfolioOverview(1, 30);

			expect(result.assets).toHaveLength(1);
			expect(result.assets[0].asset).toBe("BTC");
			expect(result.assets[0].amount).toBe(0.8);
		});

		it("should correctly show different assets across accounts", async () => {
			const today = DateTime.utc().startOf("day");
			const yesterday = today.minus({ days: 1 });

			const account1 = new AccountEntity();
			account1.id = 1;
			account1.userId = 1;
			account1.provider = ProviderType.Bitpanda;
			account1.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account1);

			const account2 = new AccountEntity();
			account2.id = 2;
			account2.userId = 1;
			account2.provider = ProviderType.Bitpanda;
			account2.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account2);

			await dataSource.getRepository(TransactionEntity).save([
				{ userId: 1, providerAccountId: 1, externalId: "tx3", asset: "BTC", type: TransactionType.buy, quantity: 1.0, eurValue: 50000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
				{ userId: 1, providerAccountId: 2, externalId: "tx4", asset: "ETH", type: TransactionType.buy, quantity: 10.0, eurValue: 30000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
			]);

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "BTC", priceEur: 50000, fetchedAt: yesterday } as AssetPriceEntity,
				{ asset: "ETH", priceEur: 3000, fetchedAt: yesterday } as AssetPriceEntity,
			]);

			await service.rebuildAll(1, 1);
			await service.rebuildAll(1, 2);

			const result = await service.getPortfolioOverview(1, 30);

			expect(result.assets).toHaveLength(2);
			const btc = result.assets.find((a) => a.asset === "BTC");
			const eth = result.assets.find((a) => a.asset === "ETH");
			expect(btc?.amount).toBe(1.0);
			expect(eth?.amount).toBe(10.0);
		});

		it("should handle sells correctly when aggregating across accounts", async () => {
			const today = DateTime.utc().startOf("day");
			const yesterday = today.minus({ days: 1 });
			const twoDaysAgo = today.minus({ days: 2 });

			const account1 = new AccountEntity();
			account1.id = 1;
			account1.userId = 1;
			account1.provider = ProviderType.Bitpanda;
			account1.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account1);

			const account2 = new AccountEntity();
			account2.id = 2;
			account2.userId = 1;
			account2.provider = ProviderType.Bitpanda;
			account2.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account2);

			await dataSource.getRepository(TransactionEntity).save([
				{ userId: 1, providerAccountId: 1, externalId: "tx5", asset: "BTC", type: TransactionType.buy, quantity: 1.0, eurValue: 50000, eurFee: 0, timestamp: twoDaysAgo } as TransactionEntity,
				{ userId: 1, providerAccountId: 1, externalId: "tx6", asset: "BTC", type: TransactionType.sell, quantity: 0.5, eurValue: 27500, eurFee: 0, timestamp: yesterday } as TransactionEntity,
				{ userId: 1, providerAccountId: 2, externalId: "tx7", asset: "BTC", type: TransactionType.buy, quantity: 0.3, eurValue: 15000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
			]);

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "BTC", priceEur: 50000, fetchedAt: yesterday } as AssetPriceEntity,
				{ asset: "BTC", priceEur: 55000, fetchedAt: today } as AssetPriceEntity,
			]);

			await service.rebuildAll(1, 1);
			await service.rebuildAll(1, 2);

			const result = await service.getPortfolioOverview(1, 30);

			expect(result.assets).toHaveLength(1);
			expect(result.assets[0].asset).toBe("BTC");
			expect(result.assets[0].amount).toBe(0.8);
		});

		it("should not double count transfer_out transactions (staking)", async () => {
			const today = DateTime.utc().startOf("day");
			const yesterday = today.minus({ days: 1 });

			const account = new AccountEntity();
			account.id = 1;
			account.userId = 1;
			account.provider = ProviderType.Bitpanda;
			account.apiEnabled = false;
			await dataSource.getRepository(AccountEntity).save(account);

			await dataSource.getRepository(TransactionEntity).save([
				{ userId: 1, providerAccountId: 1, externalId: "tx1", asset: "SOL", type: TransactionType.buy, quantity: 10.0, eurValue: 1000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
				{ userId: 1, providerAccountId: 1, externalId: "tx2", asset: "SOL", type: TransactionType.transfer_out, quantity: 10.0, eurValue: 1000, eurFee: 0, timestamp: yesterday } as TransactionEntity,
				{ userId: 1, providerAccountId: 1, externalId: "tx3", asset: "SOL", type: TransactionType.reward, quantity: 0.5, eurValue: 50, eurFee: 0, timestamp: today } as TransactionEntity,
			]);

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "SOL", priceEur: 100, fetchedAt: yesterday } as AssetPriceEntity,
				{ asset: "SOL", priceEur: 110, fetchedAt: today } as AssetPriceEntity,
			]);

			await service.rebuildAll(1, 1);

			const result = await service.getPortfolioOverview(1, 30);

			expect(result.assets).toHaveLength(1);
			expect(result.assets[0].asset).toBe("SOL");
			expect(result.assets[0].amount).toBe(10.5);
			expect(result.assets[0].eurInvested).toBe(1000);
		});
	});
});

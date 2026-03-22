import type { DataSource } from "typeorm";
import { injectable, inject } from "inversify";
import { DateTime } from "luxon";
import { TYPES } from "../../di/types.js";
import { PricesRepository } from "./prices.repository.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { TransactionType } from "@txls/shared";

@injectable()
export class PriceBackfillService {
	private repository: PricesRepository;

	constructor(
		@inject(TYPES.DataSource) private dataSource: DataSource,
		@inject(TYPES.PricesRepository) repository: PricesRepository
	) {
		this.repository = repository;
	}

	async storePricesFromTransactions(transactions: TransactionEntity[]): Promise<void> {
		const pricesByDateAndAsset = new Map<string, { priceEur: number; date: DateTime }>();

		for (const tx of transactions) {
			if (!tx.eurRate || tx.eurRate <= 0) continue;
			if (tx.type === TransactionType.reward) continue;

			const date = tx.timestamp.startOf("day");
			const key = `${tx.asset}-${date.toISODate()}`;

			if (!pricesByDateAndAsset.has(key)) {
				pricesByDateAndAsset.set(key, { priceEur: tx.eurRate, date });
			}
		}

		for (const [key, { priceEur, date }] of pricesByDateAndAsset) {
			const asset = key.split("-")[0];
			await this.repository.savePriceFromTransaction(asset, priceEur, date);
		}
	}
}

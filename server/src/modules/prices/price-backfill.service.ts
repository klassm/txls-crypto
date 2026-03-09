import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { PricesRepository } from "./prices.repository.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { TransactionType } from "@txls/shared";

export class PriceBackfillService {
	private repository: PricesRepository;

	constructor(private dataSource: DataSource) {
		this.repository = new PricesRepository(dataSource);
	}

	async storePricesFromTransactions(transactions: TransactionEntity[]): Promise<void> {
		const pricesByDateAndAsset = new Map<string, { priceEur: number; date: DateTime }>();

		for (const tx of transactions) {
			if (!tx.eurRate || tx.eurRate <= 0) continue;
			if (tx.type === TransactionType.transfer_in || tx.type === TransactionType.transfer_out) continue;

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

	async fillTransferPrices(accountId: number): Promise<number> {
		const txRepo = this.dataSource.getRepository(TransactionEntity);
		
		const transfers = await txRepo
			.createQueryBuilder("tx")
			.where("tx.provider_account_id = :accountId", { accountId })
			.andWhere("tx.type IN (:...types)", { types: [TransactionType.transfer_in, TransactionType.transfer_out] })
			.andWhere("tx.eur_value = 0")
			.getMany();

		let updated = 0;

		for (const transfer of transfers) {
			const price = await this.repository.getPriceForDate(transfer.asset, transfer.timestamp);
			
			if (price) {
				const eurValue = Number(transfer.quantity) * Number(price.priceEur);
				transfer.eurValue = eurValue;
				transfer.eurRate = Number(price.priceEur);
				await txRepo.save(transfer);
				updated++;
			}
		}

		return updated;
	}
}

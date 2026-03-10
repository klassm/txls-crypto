import "reflect-metadata";
import type { Provider, CreateProviderDto, UpdateProviderDto } from "@txls/shared";
import { ProviderType } from "@txls/shared";
import type { CsvImporter } from "../../providers/types.js";
import { providerConfigs } from "../../providers/registry.js";
import { AccountEntity } from "../accounts/account.entity.js";
import { ProvidersRepository } from "./providers.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { logger } from "../../common/logger.js";

const csvImporters: Record<ProviderType, CsvImporter | undefined> = {
	[ProviderType.Bitpanda]: providerConfigs[ProviderType.Bitpanda].csvImporter,
	[ProviderType.TradeRepublic]: providerConfigs[ProviderType.TradeRepublic].csvImporter,
};

const providerMetadata: Record<ProviderType, any> = {
	[ProviderType.Bitpanda]: providerConfigs[ProviderType.Bitpanda],
	[ProviderType.TradeRepublic]: providerConfigs[ProviderType.TradeRepublic],
};

export class ProvidersService {
	private readonly repository: ProvidersRepository;
	private readonly transactionsRepository: TransactionsRepository;

	constructor(
		repository?: ProvidersRepository,
		dataSource?: any,
		transactionsRepository?: TransactionsRepository,
	) {
		if (repository) {
			this.repository = repository;
		} else if (dataSource) {
			this.repository = new ProvidersRepository(dataSource);
		} else {
			throw new Error("Either repository or dataSource must be provided");
		}

		this.transactionsRepository =
			transactionsRepository ||
			new TransactionsRepository(dataSource ?? this["repository"]["dataSource"]);
	}

	getAvailableProviders(): Array<{
		type: ProviderType;
		name: string;
		logoBackgroundColor: string;
		logoForegroundColor: string;
		logoPath: string;
		csvImportMarkdownInstructions: string;
		csvImportAllowed: boolean;
	}> {
		return Object.entries(providerMetadata).map(([key, value]) => ({
			type: key as ProviderType,
			name: value.name,
			logoBackgroundColor: value.logoBackgroundColor,
			logoForegroundColor: value.logoForegroundColor,
			logoPath: value.logoPath,
			csvImportMarkdownInstructions: value.csvImportMarkdownInstructions,
			csvImportAllowed: csvImporters[key as ProviderType] !== undefined,
		}));
	}

	getCsvImporter(providerType: ProviderType): CsvImporter | undefined {
		return csvImporters[providerType];
	}

	async findAll(userId: number): Promise<Provider[]> {
		try {
			const entities = await this.repository.findAll(userId);
			const assetSummaries =
				await this.transactionsRepository.getAllAssetSummaries(userId);

			return entities.map((entity) => {
				const provider = this.entityToSchema(entity);
				provider.assets = assetSummaries.get(entity.id) || [];
				return provider;
			});
		} catch (error) {
			logger.error({
				message: "Failed to find providers",
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	async findById(userId: number, id: number): Promise<Provider | null> {
		try {
			const entity = await this.repository.findById(userId, id);
			if (!entity) return null;

			const provider = this.entityToSchema(entity);
			provider.assets =
				await this.transactionsRepository.getAssetSummaryByProviderAccountId(
					userId,
					id,
				);

			return provider;
		} catch (error) {
			logger.error({
				message: "Failed to find provider",
				id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	async create(
		userId: number,
		data: CreateProviderDto,
	): Promise<Provider> {
		const provider = data.type || data.provider || ProviderType.Bitpanda;
		const metadata = providerMetadata[provider as ProviderType];
		if (!metadata) {
			throw new Error("Invalid provider type");
		}

		const exists = await this.repository.existsBySource(
			userId,
			provider,
		);
		if (exists) {
			throw new Error(`Provider ${provider} already exists`);
		}

		try {
			const entity = new AccountEntity();
			entity.userId = userId;
			entity.provider = provider as any;

			const saved = await this.repository.save(entity);

			logger.info({
				message: "Provider created successfully",
				id: saved.id,
				provider: saved.provider,
			});

			return this.entityToSchema(saved);
		} catch (error) {
			logger.error({
				message: "Failed to create provider",
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	async update(
		userId: number,
		id: number,
		data: UpdateProviderDto,
	): Promise<Provider> {
		try {
			const entity = await this.repository.findById(userId, id);
			if (!entity) {
				throw new Error("Provider not found");
			}

			if (data.provider !== undefined) {
				entity.provider = data.provider as any;
			}

			const saved = await this.repository.save(entity);

			logger.info({
				message: "Provider updated successfully",
				id: saved.id,
				provider: saved.provider,
			});

			return this.entityToSchema(saved);
		} catch (error) {
			logger.error({
				message: "Failed to update provider",
				id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	async delete(userId: number, id: number): Promise<void> {
		const exists = await this.repository.exists(userId, id);
		if (!exists) {
			throw new Error("Provider not found");
		}

		try {
			await this.repository.delete(id);

			logger.info({
				message: "Provider deleted successfully",
				id,
			});
		} catch (error) {
			logger.error({
				message: "Failed to delete provider",
				id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	private entityToSchema(
		entity: AccountEntity,
	): Provider {
		const metadata = providerMetadata[entity.provider as ProviderType];
		return {
			id: entity.id,
			userId: entity.userId,
			type: entity.provider as ProviderType,
			name: metadata?.name || entity.provider,
			logoBackgroundColor: metadata?.logoBackgroundColor || "#ffffff",
			logoForegroundColor: metadata?.logoForegroundColor || "#000000",
			logoPath: metadata?.logoPath || "",
			csvImportMarkdownInstructions: metadata?.csvImportMarkdownInstructions || "",
			apiSyncMarkdownInstructions: metadata?.apiSyncMarkdownInstructions || "",
			csvImportAllowed: csvImporters[entity.provider as ProviderType] !== undefined,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		};
	}
}

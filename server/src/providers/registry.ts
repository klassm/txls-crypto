import type { ProviderConfig } from "./types.js";
import { bitpandaConfig } from "./bitpanda/config.js";
import { traderepublicConfig } from "./traderepublic/config.js";
import { ProviderType } from "@txls/shared";

export const providerConfigs: Record<ProviderType, ProviderConfig> = {
	[ProviderType.Bitpanda]: bitpandaConfig,
	[ProviderType.TradeRepublic]: traderepublicConfig,
};

export function getProviderConfig(type: string): ProviderConfig {
	return providerConfigs[type.toLowerCase() as ProviderType];
}

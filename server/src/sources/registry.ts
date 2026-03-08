import type { ProviderModuleConfig } from "./types.js";
import { bitpandaConfig } from "./bitpanda/config.js";
import { traderepublicConfig } from "./traderepublic/config.js";
import { ProviderType } from "@txls/shared";

export const sources: Record<string, ProviderModuleConfig> = {
	[ProviderType.Bitpanda]: bitpandaConfig,
	[ProviderType.TradeRepublic]: traderepublicConfig,
};

export function getProviderConfig(type: string): ProviderModuleConfig {
	return sources[type.toLowerCase()] as ProviderModuleConfig;
}

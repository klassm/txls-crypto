import type { ProviderModuleConfig } from "./types.js";
import { bitpandaConfig } from "./bitpanda/config.js";
import { traderepublicConfig } from "./traderepublic/config.js";

export const sources = {
  bitpanda: bitpandaConfig,
  tradeRepublic: traderepublicConfig,
};

export function getProviderConfig(type: string) {
  return sources[type as keyof typeof sources] as ProviderModuleConfig;
}

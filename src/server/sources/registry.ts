import type { ProviderModuleConfig } from "./types";
import { bitpandaConfig } from "./bitpanda/config";
import { traderepublicConfig } from "./traderepublic/config";

export const sources = {
  bitpanda: bitpandaConfig,
  tradeRepublic: traderepublicConfig,
};

export function getProviderConfig(type: string) {
  return sources[type as keyof typeof sources] as ProviderModuleConfig;
}

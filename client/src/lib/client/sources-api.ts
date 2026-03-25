import { apiUrl } from "../api-base";

export interface SourceConfig {
  source: string;
  name: string;
  logoBackgroundColor: string;
  logoForegroundColor: string;
  logoPath: string;
  csvImportMarkdownInstructions: string;
  apiSyncMarkdownInstructions: string;
  csvImportAllowed: boolean;
  supportsManualStaking: boolean;
}

export const sourcesApi = {
  getAll: async (): Promise<SourceConfig[]> => {
    const response = await fetch(apiUrl("/api/sources/config"), {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to fetch sources");
    }
    return response.json();
  },
};
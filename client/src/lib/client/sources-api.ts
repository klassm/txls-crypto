export interface SourceConfig {
  source: string;
  name: string;
  logoBackgroundColor: string;
  logoForegroundColor: string;
  logoPath: string;
  csvImportMarkdownInstructions: string;
  csvImportAllowed: boolean;
}

export const sourcesApi = {
  getAll: async (): Promise<SourceConfig[]> => {
    const response = await fetch("/api/sources/config");
    if (!response.ok) {
      throw new Error("Failed to fetch sources");
    }
    return response.json();
  },
};
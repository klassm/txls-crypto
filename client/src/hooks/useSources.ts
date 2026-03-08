import { useQuery } from "@tanstack/react-query";
import { sourcesApi } from "../lib/client/sources-api";

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => sourcesApi.getAll(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

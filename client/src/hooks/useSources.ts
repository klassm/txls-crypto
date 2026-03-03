import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { sourcesApi } from "../lib/client/sources-api";

export function useSources() {
  const navigate = useNavigate();

  return useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      try {
        return await sourcesApi.getAll();
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          navigate("/login");
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}
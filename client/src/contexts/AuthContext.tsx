import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@txls/shared/client";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  canOnboard: boolean;
  hassIngress: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  onboardingUser: (data: {
    name: string;
    username: string;
    password: string;
    email: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const {
    data: configData,
    isLoading: isConfigLoading,
    refetch,
  } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const response = await fetch("/api/config");
      if (!response.ok) {
        return { user: null, canOnboard: false, hassIngress: false };
      }
      const data = await response.json();
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }

      return response.json();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });

  const onboardingMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      username: string;
      password: string;
      email: string;
    }) => {
      const response = await fetch("/api/config/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Onboarding failed");
      }

      return response.json();
    },
  });

  const value: AuthContextValue = {
    user: configData?.user ?? null,
    isLoading: isConfigLoading,
    isAuthenticated: !!configData?.user,
    canOnboard: configData?.canOnboard ?? false,
    hassIngress: configData?.hassIngress ?? false,
    login: async (username, password) => {
      await loginMutation.mutateAsync({ username, password });
      await refetch();
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
      await refetch();
    },
    onboardingUser: async (data) => {
      await onboardingMutation.mutateAsync(data);
      await refetch();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUsersApi } from "@/lib/client/admin-users-api";
import type { User } from "@/lib/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

interface CreateUserData {
  name: string;
  username: string;
  password: string;
  email?: string;
  isAdmin: boolean;
}

interface UpdateUserData {
  name?: string;
  email?: string;
  isAdmin?: boolean;
}

export function useAdminUsers() {
  const { user } = useAuth();
  const router = useRouter();

  return useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      try {
        return await adminUsersApi.getAll();
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          router.push("/login");
        }
        throw err;
      }
    },
    enabled: !!user?.isAdmin,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const router = useRouter();

  return useMutation({
    mutationFn: (data: CreateUserData) => adminUsersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      showSuccess("User created successfully");
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        router.push("/login");
      }
      showError(err.error || err.message || "Failed to create user");
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const router = useRouter();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserData }) =>
      adminUsersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      showSuccess("User updated successfully");
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        router.push("/login");
      }
      showError(err.error || err.message || "Failed to update user");
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const router = useRouter();

  return useMutation({
    mutationFn: (id: number) => adminUsersApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      showSuccess("User deleted successfully");
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        router.push("/login");
      }
      showError(err.error || err.message || "Failed to delete user");
    },
  });
}

export function useResetUserPassword() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const router = useRouter();

  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => adminUsersApi.resetPassword(id, { newPassword: password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      showSuccess("Password updated successfully");
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        router.push("/login");
      }
      showError(err.error || err.message || "Failed to update password");
    },
  });
}
import { z } from "zod";

const passwordValidation = z
  .string()
  .min(15, "Password must be at least 15 characters")
  .max(255, "Password cannot exceed 255 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

export const userSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  password: passwordValidation,
  email: z.string().email("Invalid email address").max(255),
  isAdmin: z.boolean().optional(),
});

export const onboardingUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  password: passwordValidation,
  email: z.string().email("Invalid email address").max(255),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required").max(50),
  password: z.string().min(1, "Password is required").max(255),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(255).optional(),
  email: z.string().email("Invalid email address").max(255).optional(),
  isAdmin: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordValidation,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(255),
    newPassword: passwordValidation,
    confirmNewPassword: passwordValidation,
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New passwords do not match",
    path: ["confirmNewPassword"],
  });

export const providerSchema = z.object({
  type: z.string().min(1, "Provider type is required").max(50).optional(),
  provider: z.string().min(1, "Provider provider is required").max(50).optional(),
  name: z.string().max(100).optional(),
}).refine((data) => data.type || data.provider, {
  message: "Either type or provider is required",
  path: ["type"],
});

export type UserInput = z.infer<typeof userSchema>;
export type OnboardingUserInput = z.infer<typeof onboardingUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProviderInput = z.infer<typeof providerSchema>;
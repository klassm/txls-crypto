import type {User} from '@/lib/types'

interface CreateAdminUserDto {
  name: string;
  username: string;
  password: string;
  email?: string;
  isAdmin: boolean;
}

interface UpdateAdminUserDto {
  name?: string;
  email?: string;
  isAdmin?: boolean;
}

interface ResetPasswordDto {
  newPassword: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
    }))
  }

  return response.json()
}

export const adminUsersApi = {
  getAll: () => fetchJson<User[]>('/api/admin/users'),

  getById: (id: number) => fetchJson<User>(`/api/admin/users/${id}`),

  create: (data: CreateAdminUserDto) =>
    fetchJson<User>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateAdminUserDto) =>
    fetchJson<User>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    fetchJson<{ success: true }>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    }),

  resetPassword: (id: number, data: ResetPasswordDto) =>
    fetchJson<{ success: true }>(`/api/admin/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
import { apiRequest, apiRequestWithMeta } from './apiClient';
import type { ListParams, Page, UserResponseDto, UserRole } from './types';

export interface UpdateUserRolePayload {
  readonly role?: UserRole;
  readonly isActive?: boolean;
}

export interface CreateUserPayload {
  readonly email: string;
  readonly username: string;
  readonly password: string;
  readonly role: UserRole;
}

export const usersService = {
  async list(params: ListParams): Promise<Page<UserResponseDto>> {
    const { data, meta } = await apiRequestWithMeta<UserResponseDto[]>('admin/users', { params });
    return { items: data, meta: meta! };
  },

  updateUser(id: string, payload: UpdateUserRolePayload): Promise<UserResponseDto> {
    return apiRequest<UserResponseDto>(`admin/users/${id}`, { method: 'PATCH', body: payload });
  },

  /**
   * apps/backend (Milestone 5) has no admin-create-user, delete-user, or
   * reset-password endpoint — `POST /auth/register` is a public self-service
   * flow that returns a session for the *new* user, so it can't be reused
   * here for "an admin creates an account for someone else". These hit the
   * namespace a future endpoint would use and 404 until then.
   */
  createUser(payload: CreateUserPayload): Promise<UserResponseDto> {
    return apiRequest<UserResponseDto>('admin/users', { method: 'POST', body: payload });
  },

  deleteUser(id: string): Promise<void> {
    return apiRequest<void>(`admin/users/${id}`, { method: 'DELETE' });
  },

  resetPassword(id: string): Promise<void> {
    return apiRequest<void>(`admin/users/${id}/reset-password`, { method: 'POST' });
  },
};

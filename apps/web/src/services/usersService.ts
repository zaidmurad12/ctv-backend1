import { apiRequest } from '../lib/apiClient';
import type { UserResponseDto } from '../lib/types';

export interface UpdateProfilePayload {
  readonly username?: string;
}

export interface ChangePasswordPayload {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export const usersService = {
  updateProfile(payload: UpdateProfilePayload): Promise<UserResponseDto> {
    return apiRequest<UserResponseDto>('users/me', { method: 'PATCH', body: payload });
  },
  changePassword(payload: ChangePasswordPayload): Promise<void> {
    return apiRequest<void>('users/me/password', { method: 'PATCH', body: payload });
  },
};

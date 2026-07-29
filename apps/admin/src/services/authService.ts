import { apiRequest } from './apiClient';
import type { AuthResponseDto, UserResponseDto } from './types';

export interface LoginPayload {
  readonly email: string;
  readonly password: string;
}

export const authService = {
  login(payload: LoginPayload): Promise<AuthResponseDto> {
    return apiRequest<AuthResponseDto>('auth/login', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },

  logout(refreshToken: string): Promise<void> {
    return apiRequest<void>('auth/logout', { method: 'POST', body: { refreshToken } });
  },

  getProfile(): Promise<UserResponseDto> {
    return apiRequest<UserResponseDto>('auth/profile');
  },
};

import apiClient from '../../services/api/apiClient';
import { endpoints } from '../../services/api/apiEndpoints';
import type { UserResponse } from '../../types/api.types';
import type { Credentials, RegistrationData } from './authTypes';

export const getMe = async (): Promise<UserResponse> =>
  (await apiClient.get<UserResponse>(endpoints.me)).data;

export const login = async (credentials: Credentials): Promise<UserResponse> =>
  (await apiClient.post<UserResponse>(endpoints.login, credentials)).data;

export const register = async (data: RegistrationData): Promise<UserResponse> =>
  (await apiClient.post<UserResponse>(endpoints.register, data)).data;

export const verifyEmail = async (token: string): Promise<void> => {
  await apiClient.post(endpoints.verifyEmail, { token });
};

export const logout = async (): Promise<void> => {
  await apiClient.post(endpoints.logout);
};

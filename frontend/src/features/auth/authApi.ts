import { baseApi } from '../../app/api';
import type { LoginRequest, RegisterRequest, UserResponse } from '../../api/types';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query<UserResponse, void>({ query: () => '/auth/me' }),
    login: build.mutation<UserResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    register: build.mutation<UserResponse, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
  }),
});

export const { useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi;

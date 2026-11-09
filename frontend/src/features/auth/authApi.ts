import { baseApi } from '../../app/api';
import { sendWelcomeEmail } from '../email/emailjs';
import type { LoginRequest, RegisterRequest, UserResponse } from '../../api/types';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query<UserResponse, void>({ query: () => '/auth/me' }),
    login: build.mutation<UserResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    register: build.mutation<UserResponse, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      // Welcome email once the account exists (to the address the server stored, not to what the form said). Fire and forget.
      async onQueryStarted(_, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          void sendWelcomeEmail(data.user);
        } catch {
          // registration failed: nothing to send
        }
      },
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
  }),
});

export const { useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi;

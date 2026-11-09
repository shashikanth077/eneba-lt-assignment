import { baseApi } from '../../app/api';

export interface HealthResponse {
  status: string;
  db: string;
}

export const healthApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHealth: build.query<HealthResponse, void>({ query: () => '/health' }),
  }),
});

export const { useGetHealthQuery } = healthApi;

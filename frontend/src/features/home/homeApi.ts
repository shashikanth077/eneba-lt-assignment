import { baseApi } from '../../app/api';
import type { HomeLayout } from '../../api/types';

export const homeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Which blocks the homepage has, in which order (rows of home_blocks that are switched on). */
    getHomeLayout: build.query<HomeLayout, void>({ query: () => '/home/layout' }),
    /**
     * One block's data. The argument is the API path of the block ("/home/deals"), taken from the layout, so the frontend never needs to
     * know which blocks exist. The body is validated by the block that asked for it (see blocks.ts).
     */
    getHomeBlock: build.query<unknown, string>({ query: (path) => path }),
  }),
});

export const { useGetHomeLayoutQuery, useGetHomeBlockQuery } = homeApi;

import apiClient from '../../services/api/apiClient';
import { endpoints } from '../../services/api/apiEndpoints';

/** Which blocks the homepage has, in which order (rows of home_blocks that are switched on). The body is validated by blocks.ts. */
export const getHomeLayout = async (): Promise<unknown> =>
  (await apiClient.get<unknown>(endpoints.homeLayout)).data;

/**
 * One block's data. `path` is the API path of the block ("/home/deals"), taken from the layout, so the frontend never needs to know
 * which blocks exist. The body is validated by the block that asked for it (see blocks.ts).
 */
export const getHomeBlock = async (path: string): Promise<unknown> =>
  (await apiClient.get<unknown>(path)).data;

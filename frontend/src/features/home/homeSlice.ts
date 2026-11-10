import { createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import { keyedCaseReducers, type Entry } from '../../utils/keyed';
import type { HomeState } from './homeTypes';

export const LAYOUT_KEY = 'layout';

const initialState: HomeState = { layout: {}, blocks: {} };
const layout = keyedCaseReducers<HomeState, unknown>((s) => s.layout);
const blocks = keyedCaseReducers<HomeState, unknown>((s) => s.blocks);

const homeSlice = createSlice({
  name: 'home',
  initialState,
  reducers: {
    fetchHomeLayoutRequest: layout.request,
    fetchHomeLayoutSuccess: layout.success,
    fetchHomeLayoutFailure: layout.failure,
    fetchHomeBlockRequest: blocks.request,
    fetchHomeBlockSuccess: blocks.success,
    fetchHomeBlockFailure: blocks.failure,
  },
});

export const {
  fetchHomeLayoutRequest,
  fetchHomeLayoutSuccess,
  fetchHomeLayoutFailure,
  fetchHomeBlockRequest,
  fetchHomeBlockSuccess,
  fetchHomeBlockFailure,
} = homeSlice.actions;
export const homeReducer = homeSlice.reducer;

export const selectHomeLayout = (state: RootState): Entry<unknown> | undefined =>
  state.home.layout[LAYOUT_KEY];
export const selectHomeBlock =
  (path: string) =>
  (state: RootState): Entry<unknown> | undefined =>
    state.home.blocks[path];

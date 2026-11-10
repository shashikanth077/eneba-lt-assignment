import { all } from 'redux-saga/effects';
import type { RootState } from '../../app/store';
import { createKeyedWatcher } from '../../utils/keyedSaga';
import { getHomeBlock, getHomeLayout } from './homeService';
import {
  fetchHomeBlockFailure,
  fetchHomeBlockRequest,
  fetchHomeBlockSuccess,
  fetchHomeLayoutFailure,
  fetchHomeLayoutRequest,
  fetchHomeLayoutSuccess,
} from './homeSlice';

const watchLayout = createKeyedWatcher({
  request: fetchHomeLayoutRequest,
  success: fetchHomeLayoutSuccess,
  failure: fetchHomeLayoutFailure,
  entry: (state: RootState, key) => state.home.layout[key],
  fetch: () => getHomeLayout(),
});

const watchBlocks = createKeyedWatcher({
  request: fetchHomeBlockRequest,
  success: fetchHomeBlockSuccess,
  failure: fetchHomeBlockFailure,
  entry: (state: RootState, key) => state.home.blocks[key],
  fetch: getHomeBlock,
});

export function* homeSaga(): Generator {
  yield all([watchLayout(), watchBlocks()]);
}

import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import { delay, put, takeEvery } from 'redux-saga/effects';
import type { RootState } from '../../app/store';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
}

interface UiState {
  toasts: Toast[];
}

const initialState: UiState = { toasts: [] };
const TOAST_MS = 4500;

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: {
      reducer: (state, action: PayloadAction<Toast>) => {
        state.toasts.push(action.payload);
      },
      prepare: (type: Toast['type'], message: string) => ({
        payload: { id: nanoid(), type, message },
      }),
    },
    dismissToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
  },
});

export const { showToast, dismissToast } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
export const selectToasts = (state: RootState): Toast[] => state.ui.toasts;

function* autoDismiss(action: ReturnType<typeof showToast>): Generator {
  yield delay(TOAST_MS);
  yield put(dismissToast(action.payload.id));
}

export function* uiSaga(): Generator {
  yield takeEvery(showToast.type, autoDismiss as never);
}

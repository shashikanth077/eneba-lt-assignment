import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import { isDisplayCurrency } from './currencies';
import { loadCurrency, saveCurrency } from './settingsStorage';

interface SettingsState {
  currency: string;
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: (): SettingsState => ({ currency: loadCurrency() }),
  reducers: {
    currencyChosen: (state, action: PayloadAction<string>) => {
      if (!isDisplayCurrency(action.payload)) return;
      state.currency = action.payload;
      saveCurrency(action.payload);
    },
  },
});

export const { currencyChosen } = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;
export const selectDisplayCurrency = (state: RootState): string => state.settings.currency;

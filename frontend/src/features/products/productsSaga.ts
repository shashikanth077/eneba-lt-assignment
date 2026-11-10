import type { RootState } from '../../app/store';
import { createKeyedWatcher } from '../../utils/keyedSaga';
import * as service from './productsService';
import {
  fetchFacetsFailure,
  fetchFacetsRequest,
  fetchFacetsSuccess,
  fetchProductFailure,
  fetchProductRequest,
  fetchProductsFailure,
  fetchProductsRequest,
  fetchProductsSuccess,
  fetchProductSuccess,
  fetchSuggestionsFailure,
  fetchSuggestionsRequest,
  fetchSuggestionsSuccess,
  searchProductsFailure,
  searchProductsRequest,
  searchProductsSuccess,
} from './productsSlice';
import { all } from 'redux-saga/effects';

const watchList = createKeyedWatcher({
  request: fetchProductsRequest,
  success: fetchProductsSuccess,
  failure: fetchProductsFailure,
  entry: (state: RootState, key) => state.products.list[key],
  fetch: service.getProducts,
});

const watchFacets = createKeyedWatcher({
  request: fetchFacetsRequest,
  success: fetchFacetsSuccess,
  failure: fetchFacetsFailure,
  entry: (state: RootState, key) => state.products.facets[key],
  fetch: service.getFilters,
});

const watchDetails = createKeyedWatcher({
  request: fetchProductRequest,
  success: fetchProductSuccess,
  failure: fetchProductFailure,
  entry: (state: RootState, key) => state.products.details[key],
  fetch: service.getProduct,
});

const watchSearch = createKeyedWatcher({
  request: searchProductsRequest,
  success: searchProductsSuccess,
  failure: searchProductsFailure,
  entry: (state: RootState, key) => state.products.search[key],
  fetch: (key) => {
    const [q, page] = JSON.parse(key) as [string, number];
    return service.searchProducts(q, page);
  },
});

const watchSuggestions = createKeyedWatcher({
  request: fetchSuggestionsRequest,
  success: fetchSuggestionsSuccess,
  failure: fetchSuggestionsFailure,
  entry: (state: RootState, key) => state.products.suggestions[key],
  fetch: service.getSuggestions,
});

export function* productsSaga(): Generator {
  yield all([watchList(), watchFacets(), watchDetails(), watchSearch(), watchSuggestions()]);
}

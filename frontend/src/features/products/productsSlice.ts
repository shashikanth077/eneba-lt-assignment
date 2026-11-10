import { createSlice } from '@reduxjs/toolkit';
import type {
  Filters,
  Paginated,
  ProductCard,
  ProductResponse,
  SuggestResponse,
} from '../../types/api.types';
import { keyedCaseReducers } from '../../utils/keyed';
import type { ProductsState } from './productsTypes';

const initialState: ProductsState = {
  list: {},
  facets: {},
  details: {},
  search: {},
  suggestions: {},
};

const list = keyedCaseReducers<ProductsState, Paginated<ProductCard>>((s) => s.list);
const facets = keyedCaseReducers<ProductsState, Filters>((s) => s.facets);
const details = keyedCaseReducers<ProductsState, ProductResponse>((s) => s.details);
const search = keyedCaseReducers<ProductsState, Paginated<ProductCard>>((s) => s.search);
const suggestions = keyedCaseReducers<ProductsState, SuggestResponse>((s) => s.suggestions);

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    fetchProductsRequest: list.request,
    fetchProductsSuccess: list.success,
    fetchProductsFailure: list.failure,

    fetchFacetsRequest: facets.request,
    fetchFacetsSuccess: facets.success,
    fetchFacetsFailure: facets.failure,

    fetchProductRequest: details.request,
    fetchProductSuccess: details.success,
    fetchProductFailure: details.failure,

    searchProductsRequest: search.request,
    searchProductsSuccess: search.success,
    searchProductsFailure: search.failure,

    fetchSuggestionsRequest: suggestions.request,
    fetchSuggestionsSuccess: suggestions.success,
    fetchSuggestionsFailure: suggestions.failure,
  },
});

export const {
  fetchProductsRequest,
  fetchProductsSuccess,
  fetchProductsFailure,
  fetchFacetsRequest,
  fetchFacetsSuccess,
  fetchFacetsFailure,
  fetchProductRequest,
  fetchProductSuccess,
  fetchProductFailure,
  searchProductsRequest,
  searchProductsSuccess,
  searchProductsFailure,
  fetchSuggestionsRequest,
  fetchSuggestionsSuccess,
  fetchSuggestionsFailure,
} = productsSlice.actions;
export const productsReducer = productsSlice.reducer;

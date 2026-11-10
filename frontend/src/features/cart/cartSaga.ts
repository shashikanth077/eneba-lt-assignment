import { call, cancel, fork, put, select, takeEvery, takeLatest, take } from 'redux-saga/effects';
import type { Task } from 'redux-saga';
import { toApiError } from '../../services/api/apiErrorHandler';
import type { Cart, CartLine, ProductResponse } from '../../types/api.types';
import type { SerializedApiError } from '../../types/common.types';
import type { RootState } from '../../app/store';
import { getProduct } from '../products/productsService';
import {
  bootstrapSuccess,
  loginSuccess,
  registerSuccess,
  selectIsAuthenticated,
  sessionExpired,
  signedOut,
} from '../auth/authSlice';
import { showToast } from '../ui/uiSlice';
import * as cartService from './cartService';
import {
  addToCartRequest,
  fetchCartFailure,
  fetchCartRequest,
  fetchCartSuccess,
  lineChangeFailure,
  guestLinesChanged,
  lineChangeSuccess,
  mergeFinished,
  mergeStarted,
  removeLineRequest,
  setQuantityRequest,
} from './cartSlice';
import { saveGuestLines } from './guestCartStorage';

/** The server's limits (CartService), applied to the guest cart too so the two behave the same. */
const MAX_QTY_PER_LINE = 5;

/** A refusal the guest cart makes itself (no request involved); shown exactly like a server refusal on the line. */
class GuestCartError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  serialize(): SerializedApiError {
    return { status: 409, code: this.code, message: this.message, details: null };
  }
}
const guestError = (code: string, message: string) => new GuestCartError(code, message);
const asApiError = (error: unknown): SerializedApiError =>
  error instanceof GuestCartError ? error.serialize() : toApiError(error);

const guestLines = (state: RootState): CartLine[] => state.cart.guest;

function* storeGuestLines(offerId: number | undefined, lines: CartLine[]): Generator {
  saveGuestLines(lines);
  yield put(guestLinesChanged({ offerId, lines }));
}

/** Limit a quantity may not exceed: at most 5 of one offer, and what the catalogue said is in stock. */
const maxFor = (line: Pick<CartLine, 'available'>): number =>
  Math.min(MAX_QTY_PER_LINE, line.available);

/** Guest cart page: re-read prices and stock of every game in it from the public catalogue, so the page never shows stale numbers. */
function* refreshGuestCart(): Generator {
  const lines = (yield select(guestLines)) as CartLine[];
  const slugs = [...new Set(lines.map((line) => line.productSlug))];
  const fresh = new Map<number, { priceCents: number; stock: number } | null>();
  for (const slug of slugs) {
    try {
      const { offers } = (yield call(getProduct, slug)) as ProductResponse;
      for (const line of lines.filter((l) => l.productSlug === slug)) {
        const offer = offers.find((o) => o.id === line.offerId);
        fresh.set(
          line.offerId,
          offer ? { priceCents: offer.priceCents, stock: offer.stock } : null,
        );
      }
    } catch {
      // the catalogue could not be reached: keep what the cart already knows
    }
  }
  const current = (yield select(guestLines)) as CartLine[]; // the visitor may have changed it meanwhile
  const updated = current.map((line) => {
    if (!fresh.has(line.offerId)) return line;
    const offer = fresh.get(line.offerId);
    return offer
      ? { ...line, unitCents: offer.priceCents, available: offer.stock }
      : { ...line, available: 0 };
  });
  yield* storeGuestLines(undefined, updated);
}

function* fetchCart(): Generator {
  if (!((yield select(selectIsAuthenticated)) as boolean)) {
    yield call(refreshGuestCart);
    return;
  }
  try {
    const cart = (yield call(cartService.getCart)) as Cart;
    yield put(fetchCartSuccess(cart));
  } catch (error) {
    yield put(fetchCartFailure(toApiError(error)));
  }
}

/** A visitor who is not signed in adds to the browser's own cart. The offer's price, seller and stock come from the public catalogue. */
function* addToGuestCart(offerId: number, qty: number, productSlug: string | undefined): Generator {
  try {
    if (!productSlug) throw guestError('unknown_product', 'Open the game page to add this offer');
    const { product, offers } = (yield call(getProduct, productSlug)) as ProductResponse;
    const offer = offers.find((o) => o.id === offerId);
    if (!offer || offer.stock === 0) throw guestError('out_of_stock', 'Out of stock');
    const lines = (yield select(guestLines)) as CartLine[];
    const existing = lines.find((line) => line.offerId === offerId);
    const wanted = (existing?.qty ?? 0) + qty;
    const limit = maxFor({ available: offer.stock });
    if (wanted > limit) {
      throw guestError(
        'insufficient_stock',
        offer.stock < MAX_QTY_PER_LINE
          ? `Only ${offer.stock} left`
          : `At most ${MAX_QTY_PER_LINE} of the same offer per order`,
      );
    }
    const line: CartLine = {
      offerId,
      productSlug: product.slug,
      productName: product.name,
      sellerName: offer.seller.name,
      unitCents: offer.priceCents,
      qty: wanted,
      lineCents: offer.priceCents * wanted,
      available: offer.stock,
    };
    yield* storeGuestLines(
      offerId,
      existing ? lines.map((l) => (l.offerId === offerId ? line : l)) : [...lines, line],
    );
    yield put(showToast('success', 'Added to your cart'));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: asApiError(error) }));
  }
}

function* addToCart(action: ReturnType<typeof addToCartRequest>): Generator {
  const { offerId, qty, productSlug } = action.payload;
  if (!((yield select(selectIsAuthenticated)) as boolean)) {
    yield call(addToGuestCart, offerId, qty ?? 1, productSlug);
    return;
  }
  try {
    const cart = (yield call(cartService.addToCart, offerId, qty)) as Cart;
    yield put(lineChangeSuccess({ offerId, cart }));
    yield put(showToast('success', 'Added to your cart'));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: toApiError(error) }));
  }
}

function* setQuantity(action: ReturnType<typeof setQuantityRequest>): Generator {
  const { offerId, qty } = action.payload;
  if (!((yield select(selectIsAuthenticated)) as boolean)) {
    const lines = (yield select(guestLines)) as CartLine[];
    const line = lines.find((l) => l.offerId === offerId);
    if (!line) return;
    if (qty > maxFor(line)) {
      const message =
        line.available < MAX_QTY_PER_LINE
          ? `Only ${line.available} left`
          : `At most ${MAX_QTY_PER_LINE} of the same offer per order`;
      yield put(
        lineChangeFailure({
          offerId,
          error: guestError('insufficient_stock', message).serialize(),
        }),
      );
      return;
    }
    yield* storeGuestLines(
      offerId,
      lines.map((l) => (l.offerId === offerId ? { ...l, qty } : l)),
    );
    return;
  }
  try {
    const cart = (yield call(cartService.setCartQuantity, offerId, qty)) as Cart;
    yield put(lineChangeSuccess({ offerId, cart }));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: toApiError(error) }));
  }
}

function* removeLine(action: ReturnType<typeof removeLineRequest>): Generator {
  const offerId = action.payload;
  if (!((yield select(selectIsAuthenticated)) as boolean)) {
    const lines = (yield select(guestLines)) as CartLine[];
    yield* storeGuestLines(
      offerId,
      lines.filter((l) => l.offerId !== offerId),
    );
    return;
  }
  try {
    const cart = (yield call(cartService.removeCartLine, offerId)) as Cart;
    yield put(lineChangeSuccess({ offerId, cart }));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: toApiError(error) }));
  }
}

/** All the cart's work, stopped the moment the session ends so a late answer cannot put the old user's cart back. */
function* cartWork(): Generator {
  yield takeLatest(fetchCartRequest.type, fetchCart);
  yield takeEvery(addToCartRequest.type, addToCart as never);
  yield takeEvery(setQuantityRequest.type, setQuantity as never);
  yield takeEvery(removeLineRequest.type, removeLine as never);
}

/**
 * Right after somebody signs in (or registers): the items they put in the cart as a visitor go into their account's cart, through the
 * same POST /api/cart a signed-in add uses, so the server checks stock and quantity limits. Adding raises the quantity of a line the
 * account already had, so nothing is lost. Lines the server refuses are reported, not silently dropped; the guest cart is emptied afterwards.
 */
function* afterSignIn(): Generator {
  const guest = (yield select(guestLines)) as CartLine[];
  if (guest.length > 0) {
    yield put(mergeStarted());
    const refused: string[] = [];
    for (const line of guest) {
      try {
        yield call(cartService.addToCart, line.offerId, line.qty);
      } catch (error) {
        refused.push(`${line.productName} (${toApiError(error).message})`);
      }
    }
    saveGuestLines([]);
    yield put(mergeFinished());
    yield put(
      showToast(
        refused.length === 0 ? 'success' : 'error',
        refused.length === 0
          ? 'The items you chose before signing in are in your cart'
          : `Some items could not be added to your cart: ${refused.join(', ')}`,
      ),
    );
  }
  yield put(fetchCartRequest());
}

export function* cartSaga(): Generator {
  // Whenever somebody becomes signed in, load their cart (the header badge needs it on every page).
  yield takeLatest([bootstrapSuccess.type, loginSuccess.type, registerSuccess.type], afterSignIn);

  while (true) {
    const work = (yield fork(cartWork)) as Task;
    yield take([signedOut.type, sessionExpired.type]);
    yield cancel(work);
  }
}

/**
 * The API contract, written by hand from docs/ARCHITECTURE.md and the backend responses. Money is always integer cents.
 * Keep this file in sync with the backend: it is the single place where the shape of the API is described on this side.
 */

// ---- errors ----------------------------------------------------------------------------------

/** Every error the backend returns. `details` is null when there is nothing to add. */
export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> | null };
}

// ---- auth ------------------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface UserResponse {
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  displayName: string;
}

// ---- catalog ---------------------------------------------------------------------------------

export interface NamedRef {
  slug: string;
  name: string;
}

export interface ProductCard {
  id: number;
  slug: string;
  name: string;
  coverUrl: string;
  platform: NamedRef;
  region: NamedRef;
  /** null when the product is out of stock (only possible in search results) */
  fromPriceCents: number | null;
  offerCount: number;
  inStock: boolean;
  discountPct?: number;
  /** 0..1, only in search results */
  score?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface Filters {
  platforms: FacetOption[];
  regions: FacetOption[];
  genres: FacetOption[];
  price: { min: number | null; max: number | null };
}

export interface Offer {
  id: number;
  seller: { id: number; name: string; rating: number };
  priceCents: number;
  originalPriceCents?: number;
  stock: number;
  deliveryType: 'instant';
}

export interface ProductDetail extends ProductCard {
  description: string;
  releaseDate: string;
  genres: string[];
  publisher: string;
}

export interface ProductResponse {
  product: ProductDetail;
  offers: Offer[];
}

export interface Suggestion {
  slug: string;
  name: string;
  coverUrl: string;
  platform: NamedRef;
  inStock: boolean;
  score: number;
}

export interface SuggestResponse {
  suggestions: Suggestion[];
}

// ---- homepage --------------------------------------------------------------------------------

export interface HomeBlockMeta {
  id: string;
  /** names the frontend renderer, e.g. "hero" | "carousel" */
  type: string;
  title: string;
  endpoint: string;
  config: Record<string, unknown>;
}

export interface HomeLayout {
  blocks: HomeBlockMeta[];
}

/** GET /api/home/banners */
export interface BannerItem {
  id: number;
  imageUrl: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
}

/** GET /api/home/deals adds the crossed-out price to the usual card. */
export interface HomeProduct extends ProductCard {
  originalPriceCents?: number;
}

// ---- cart ------------------------------------------------------------------------------------

export interface CartLine {
  offerId: number;
  productSlug: string;
  productName: string;
  sellerName: string;
  unitCents: number;
  qty: number;
  lineCents: number;
  available: number;
}

export interface CartIssue {
  offerId: number;
  code: 'inactive' | 'out_of_stock' | 'insufficient_stock';
  message: string;
}

export interface Cart {
  lines: CartLine[];
  totalCents: number;
  currency: string;
  issues: CartIssue[];
}

// ---- orders ----------------------------------------------------------------------------------

export type OrderStatus =
  'pending' | 'paid' | 'failed' | 'expired' | 'canceled' | 'refund_needed' | 'refunded';

export interface OrderItem {
  productSlug: string;
  productName: string;
  sellerName: string;
  unitPriceCents: number;
  qty: number;
  /** Only present on a paid order, and only from GET /api/orders/{id}. Never copy these anywhere but the order page. */
  keys?: string[];
}

export interface OrderDetail {
  id: number;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  reservedUntil?: string;
  paidAt?: string;
  items: OrderItem[];
}

export interface Checkout {
  orderId: number;
  clientSecret: string;
  totalCents: number;
  currency: string;
  reservedUntil: string;
}

export interface OrderSummary {
  id: number;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  itemCount: number;
}

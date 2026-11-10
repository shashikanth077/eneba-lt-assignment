import type { HomeBlockMeta } from '../../types/api.types';
import type { Keyed } from '../../utils/keyed';

/** What every block renderer receives: the layout's description of the block. It fetches its own data from `block.endpoint`. */
export interface BlockProps {
  block: HomeBlockMeta;
}

export interface HomeState {
  /** The layout (which blocks, in which order): one entry, key "layout". The body is validated by blocks.ts, not trusted. */
  layout: Keyed<unknown>;
  /** One entry per block endpoint ("/home/deals"). Each block asks for its own and keeps its own loading and error state. */
  blocks: Keyed<unknown>;
}

import type { HomeBlockMeta } from '../../api/types';

/** What every block renderer receives: the layout's description of the block. It fetches its own data from `block.endpoint`. */
export interface BlockProps {
  block: HomeBlockMeta;
}

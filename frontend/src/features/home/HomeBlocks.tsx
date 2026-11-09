import Box from '@mui/material/Box';
import type { HomeBlockMeta } from '../../api/types';
import { EmptyState } from '../../components/state/EmptyState';
import { BlockBoundary } from './BlockBoundary';
import { blockRenderers } from './blockRegistry';

/** What the page says when no block is switched on (or none of them can be drawn). */
export function HomeEmpty() {
  return (
    <EmptyState
      title="Nothing to show yet"
      description="No homepage sections are switched on right now."
    />
  );
}

/** Draws the layout: one renderer per block, in the order the server gave, each isolated from the others. */
export function HomeBlocks({ blocks }: { blocks: HomeBlockMeta[] }) {
  const rendered = blocks.flatMap((block) => {
    const Renderer = Object.hasOwn(blockRenderers, block.type)
      ? blockRenderers[block.type]
      : undefined;
    if (!Renderer) {
      if (import.meta.env.DEV)
        console.warn(
          `[home] no renderer for block type "${block.type}" (block "${block.id}"), skipped`,
        );
      return [];
    }
    return [
      <BlockBoundary key={block.id} title={block.title}>
        <Renderer block={block} />
      </BlockBoundary>,
    ];
  });

  if (rendered.length === 0) return <HomeEmpty />;
  // minmax(0, 1fr): a grid column may shrink below its content, otherwise a wide scrolling rail stretches the whole page
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: { xs: 4, md: 6 } }}>
      {rendered}
    </Box>
  );
}

import { describe, expect, it } from 'vitest';
import { suggestQuery } from './didYouMean';

describe('suggestQuery', () => {
  it('repairs a misspelled word using the best match title', () => {
    expect(suggestQuery('stormhavn', 'Tides of Stormhaven')).toBe('stormhaven');
    expect(suggestQuery('wither 3', 'The Witcher 3: Wild Hunt')).toBe('witcher 3');
    expect(suggestQuery('lunr odysey', 'Lunar Odyssey')).toBe('lunar odyssey');
  });

  it('keeps words that are right or still being typed', () => {
    expect(suggestQuery('stormha', 'Tides of Stormhaven')).toBeNull(); // a prefix of a title word
    expect(suggestQuery('tides stormhavn', 'Tides of Stormhaven')).toBe('tides stormhaven');
  });

  it('offers nothing when it would repeat the query or nothing is close', () => {
    expect(suggestQuery('stormhaven', 'Tides of Stormhaven')).toBeNull();
    expect(suggestQuery('zzzzz', 'Tides of Stormhaven')).toBeNull();
    expect(suggestQuery('', 'Tides of Stormhaven')).toBeNull();
  });

  it('ignores case, accents and apostrophes like the backend does', () => {
    expect(suggestQuery('ASSASINS', "Assassin's Creed")).toBe('assassins');
    expect(suggestQuery('pokemon', 'Pokémon Sword')).toBeNull();
  });

  it('is more careful with short words (one edit per three letters)', () => {
    expect(suggestQuery('gam', 'Games of War')).toBeNull(); // prefix
    expect(suggestQuery('xyz', 'Games of War')).toBeNull();
  });
});

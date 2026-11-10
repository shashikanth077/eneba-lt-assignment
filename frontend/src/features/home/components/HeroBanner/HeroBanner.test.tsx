import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { banners, block, homeBackend } from '../../../../test/homeBackend';
import { renderWithProviders } from '../../../../test/renderApp';
import { BannerCarousel } from './HeroBanner';

const hero = (config: Record<string, unknown> = {}) =>
  block('banner', 'hero', 'Featured', '/api/home/banners', config);

function setup(config: Record<string, unknown> = {}, body: unknown = banners) {
  homeBackend([], { 'GET /api/home/banners': { body } });
  return renderWithProviders(<BannerCarousel block={hero(config)} />);
}

const title = () => screen.getByRole('heading', { level: 2 }).textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BannerCarousel', () => {
  it('shows the first banner with its text and a button that links where the database says', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: 'Fresh drops' })).toBeInTheDocument();
    expect(screen.getByText('The newest games')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop new' })).toHaveAttribute(
      'href',
      '/store?sort=newest',
    );
    expect(screen.getByRole('region', { name: 'Featured' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
  });

  it('next, previous and the dots move between banners and wrap around', async () => {
    setup();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Fresh drops' });

    await user.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(title()).toBe('Weekend deals');

    await user.click(screen.getByRole('button', { name: 'Previous banner' }));
    await user.click(screen.getByRole('button', { name: 'Previous banner' }));
    expect(title()).toBe('Steam keys'); // wrapped from the first to the last

    await user.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(title()).toBe('Fresh drops'); // and back

    await user.click(screen.getByRole('button', { name: 'Show banner 2 of 3' }));
    expect(title()).toBe('Weekend deals');
    expect(screen.getByRole('button', { name: 'Show banner 2 of 3' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('a single banner has no controls', async () => {
    setup({}, { items: [banners.items[0]] });

    await screen.findByRole('heading', { name: 'Fresh drops' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the banner without a button when its link is not a path on this site', async () => {
    setup({}, { items: [{ ...banners.items[0], href: 'https://evil.example/phish' }] });

    expect(await screen.findByRole('heading', { name: 'Fresh drops' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('draws nothing at all when there are no banners', async () => {
    setup({}, { items: [] });

    await screen.findByRole('main', {}, { timeout: 50 }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  describe('autoplay (opt-in through the block config)', () => {
    it('advances on the configured interval', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setup({ autoplayMs: 3000 });
      await screen.findByRole('heading', { name: 'Fresh drops' });

      act(() => void vi.advanceTimersByTime(3000));
      expect(title()).toBe('Weekend deals');
      act(() => void vi.advanceTimersByTime(3000));
      expect(title()).toBe('Steam keys');
      act(() => void vi.advanceTimersByTime(3000));
      expect(title()).toBe('Fresh drops');
    });

    it('does not advance when the config has no autoplay', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setup({});
      await screen.findByRole('heading', { name: 'Fresh drops' });

      act(() => void vi.advanceTimersByTime(60_000));
      expect(title()).toBe('Fresh drops');
    });

    it('ignores an unreadably fast interval', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setup({ autoplayMs: 100 });
      await screen.findByRole('heading', { name: 'Fresh drops' });

      act(() => void vi.advanceTimersByTime(10_000));
      expect(title()).toBe('Fresh drops');
    });

    it('pauses while the pointer is over it and resumes afterwards', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setup({ autoplayMs: 3000 });
      await screen.findByRole('heading', { name: 'Fresh drops' });
      const region = screen.getByRole('region', { name: 'Featured' });
      const user = userEvent.setup(); // ONE instance: it remembers where the pointer is, so unhover really leaves the element

      await user.hover(region);
      // 4 s = exactly one autoplay step, so a carousel that ignored the hover would be on banner 2 here. (10 s = three steps would wrap
      // three banners back to banner 1 and hide the bug.)
      act(() => void vi.advanceTimersByTime(4000));
      expect(title()).toBe('Fresh drops');

      await user.unhover(region);
      act(() => void vi.advanceTimersByTime(3000));
      expect(title()).toBe('Weekend deals');
    });

    it('stays still for people who asked for reduced motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }));
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setup({ autoplayMs: 3000 });
      await screen.findByRole('heading', { name: 'Fresh drops' });

      act(() => void vi.advanceTimersByTime(30_000));
      expect(title()).toBe('Fresh drops');
    });

    it('clears its own timer when it leaves the page', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const started: unknown[] = [];
      const cleared: unknown[] = [];
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      const view = setup({ autoplayMs: 3000 });
      await screen.findByRole('heading', { name: 'Fresh drops' });
      // (Testing Library polls with its own short interval, so only the carousel's 3 s timer is looked at)
      setIntervalSpy.mock.calls.forEach(
        (call, i) => call[1] === 3000 && started.push(setIntervalSpy.mock.results[i].value),
      );
      expect(started.length).toBeGreaterThan(0);

      view.unmount();

      clearIntervalSpy.mock.calls.forEach((call) => cleared.push(call[0]));
      for (const id of started) expect(cleared).toContain(id);
    });
  });
});

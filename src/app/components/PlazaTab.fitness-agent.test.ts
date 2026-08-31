import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlazaTab from './PlazaTab';
import MusicAgentsTab from './MusicAgentsTab';

describe('Fitness Agent top-level entry', () => {
  it.each(['skills', 'canvas', 'worlds'] as const)('sits below the title and sub-tabs in %s', (initialMode) => {
    const html = renderToStaticMarkup(createElement(PlazaTab, { initialMode }));
    const entry = html.indexOf('data-agent-entry="fitness"');

    expect(entry).toBeGreaterThan(-1);
    expect(entry).toBeGreaterThan(html.indexOf('<h1'));
    expect(entry).toBeGreaterThan(html.indexOf('>MY SKILLS</button>'));
    expect(entry).toBeGreaterThan(html.indexOf('>SKILL CANVAS</button>'));
    expect(entry).toBeGreaterThan(html.indexOf('>AGENT WORLD</button>'));
    expect(html.match(/data-agent-entry="fitness"/g)).toHaveLength(1);
    expect(html).toContain('Open the Fitness Agent main router');
  });

  it('does not duplicate the parent router inside embedded Skills', () => {
    const html = renderToStaticMarkup(createElement(MusicAgentsTab, { embedded: true }));
    expect(html).not.toContain('FITNESS AGENT');
    expect(html).not.toContain('data-agent-entry="fitness"');
  });

  it('also puts the router below the heading and before the skills in the standalone page', () => {
    const html = renderToStaticMarkup(createElement(MusicAgentsTab));
    const entry = html.indexOf('data-agent-entry="fitness"');
    expect(entry).toBeGreaterThan(-1);
    expect(entry).toBeGreaterThan(html.indexOf('<h1'));
    expect(entry).toBeLessThan(html.indexOf('<section aria-label="Core abilities"'));
    expect(html.match(/data-agent-entry="fitness"/g)).toHaveLength(1);
  });

  it('shows running and bird listening as core cards in Agent World', () => {
    const html = renderToStaticMarkup(createElement(PlazaTab, { initialMode: 'worlds' }));
    for (const label of ['Runner Route Map', 'Bird ID']) {
      const start = html.indexOf(`aria-label="Enter ${label}, `);
      expect(start).toBeGreaterThan(-1);
      expect(html.slice(start, html.indexOf('</button>', start))).toContain('CORE SKILL');
    }
  });
});

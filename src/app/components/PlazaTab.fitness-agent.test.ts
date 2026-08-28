import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlazaTab from './PlazaTab';
import MusicAgentsTab from './MusicAgentsTab';

describe('Fitness Agent top-level entry', () => {
  it.each(['skills', 'canvas', 'worlds'] as const)('sits above the title and sub-tabs in %s', (initialMode) => {
    const html = renderToStaticMarkup(createElement(PlazaTab, { initialMode }));
    const entry = html.indexOf('data-agent-entry="fitness"');

    expect(entry).toBeGreaterThan(-1);
    expect(entry).toBeLessThan(html.indexOf('<h1'));
    expect(entry).toBeLessThan(html.indexOf('>MY SKILLS</button>'));
    expect(entry).toBeLessThan(html.indexOf('>技能画布</button>'));
    expect(entry).toBeLessThan(html.indexOf('>AGENT WORLD</button>'));
    expect(html.match(/data-agent-entry="fitness"/g)).toHaveLength(1);
    expect(html).toContain('打开 Fitness Agent 总路由');
  });

  it('does not duplicate the parent router inside embedded Skills', () => {
    const html = renderToStaticMarkup(createElement(MusicAgentsTab, { embedded: true }));
    expect(html).not.toContain('FITNESS AGENT');
    expect(html).not.toContain('data-agent-entry="fitness"');
  });

  it('also puts the router above the heading in the standalone Skills page', () => {
    const html = renderToStaticMarkup(createElement(MusicAgentsTab));
    const entry = html.indexOf('data-agent-entry="fitness"');
    expect(entry).toBeGreaterThan(-1);
    expect(entry).toBeLessThan(html.indexOf('<h1'));
    expect(html.match(/data-agent-entry="fitness"/g)).toHaveLength(1);
  });
});

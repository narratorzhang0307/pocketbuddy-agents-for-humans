import { describe, expect, it, vi } from 'vitest';
import {
  formatAmapError,
  setAmapBuildingsVisible,
} from '../../../vendor/legacy-city/src/app/lib/maps/amapBuildings';

function fixture() {
  const layer = { show: vi.fn(), hide: vi.fn() };
  const map = { add: vi.fn(), remove: vi.fn() };
  const constructed = vi.fn();
  class Buildings {
    constructor(options: Record<string, unknown>) {
      constructed(options);
      return layer;
    }
    show = layer.show;
    hide = layer.hide;
  }
  return { layer, map, api: { Buildings }, constructed };
}

describe('optional AMap building layer', () => {
  it('does not instantiate or attach the default-hidden 3D layer', () => {
    const { map, api, constructed } = fixture();
    expect(setAmapBuildingsVisible(map, api, null, false)).toBeNull();
    expect(constructed).not.toHaveBeenCalled();
    expect(map.add).not.toHaveBeenCalled();
  });

  it('creates on demand and reuses the same layer when toggled', () => {
    const { layer, map, api, constructed } = fixture();
    expect(setAmapBuildingsVisible(map, api, null, true)).toBe(layer);
    expect(map.add).toHaveBeenCalledWith(layer);
    expect(setAmapBuildingsVisible(map, api, layer, false)).toBe(layer);
    expect(layer.hide).toHaveBeenCalledOnce();
    expect(setAmapBuildingsVisible(map, api, layer, true)).toBe(layer);
    expect(layer.show).toHaveBeenCalledOnce();
    expect(constructed).toHaveBeenCalledOnce();
  });

  it('detaches a rejected layer and preserves the native SDK error', () => {
    const { layer, map, api } = fixture();
    const failure = new TypeError("undefined is not an object (evaluating 'n.gn.Ha')");
    map.add.mockImplementation(() => { throw failure; });
    expect(() => setAmapBuildingsVisible(map, api, null, true)).toThrow(failure);
    expect(map.remove).toHaveBeenCalledWith(layer);
  });

  it('does not mask the renderer error if cleanup also fails', () => {
    const { map, api } = fixture();
    map.add.mockImplementation(() => { throw new Error('renderer failed'); });
    map.remove.mockImplementation(() => { throw new Error('cleanup failed'); });
    expect(() => setAmapBuildingsVisible(map, api, null, true)).toThrow('renderer failed');
  });

  it('keeps a Safari error message even when its stack only contains frames', () => {
    const error = new TypeError('renderer unavailable');
    error.stack = 'r@https://webapi.amap.com/maps:1:123';
    expect(formatAmapError(error)).toContain('TypeError: renderer unavailable');
    expect(formatAmapError(error)).toContain('maps:1:123');
  });

  it('redacts map credentials in native error logs', () => {
    expect(formatAmapError('https://example.test/?key=secret&jscode=code&token=auth'))
      .toBe('https://example.test/?key=[REDACTED]&jscode=[REDACTED]&token=[REDACTED]');
  });
});

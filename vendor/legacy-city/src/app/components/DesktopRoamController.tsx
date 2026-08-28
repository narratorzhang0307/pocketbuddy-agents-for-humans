import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { screenHeadingFromControllerVector } from '../lib/agent3d/desktopRoam';

export type DesktopRoamInput = {
  screenHeadingRadians: number | null;
  throttle: number;
};

type DesktopRoamControllerProps = {
  theme?: 'steam' | 'retro';
  mode: 'auto' | 'manual';
  cruiseActive: boolean;
  canPlant: boolean;
  onModeChange: (mode: 'auto' | 'manual') => void;
  onInput: (input: DesktopRoamInput) => void;
  onCruiseToggle: () => void;
  onPlant: () => void;
  onInteract: () => void;
  onView: () => void;
  onViewOrbitStart: () => void;
  onViewOrbitEnd: () => void;
  onRecenter: () => void;
  onClose: () => void;
};

const ZERO_INPUT: DesktopRoamInput = {
  screenHeadingRadians: null,
  throttle: 0,
};

export default function DesktopRoamController({
  theme = 'retro',
  mode,
  cruiseActive,
  canPlant,
  onModeChange,
  onInput,
  onCruiseToggle,
  onPlant,
  onInteract,
  onView,
  onViewOrbitStart,
  onViewOrbitEnd,
  onRecenter,
  onClose,
}: DesktopRoamControllerProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const keyboardRef = useRef(new Set<string>());
  const lastHeadingRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [activeDirection, setActiveDirection] = useState<
    'up' | 'right' | 'down' | 'left' | null
  >(null);
  const [viewOrbiting, setViewOrbiting] = useState(false);
  const [shellTone, setShellTone] = useState<'gray' | 'purple'>('gray');
  const viewOrbitingRef = useRef(false);
  const orbitEndRef = useRef(onViewOrbitEnd);
  orbitEndRef.current = onViewOrbitEnd;

  const emitDirection = (x: number, y: number, throttle: number) => {
    const heading = screenHeadingFromControllerVector(x, y);
    if (heading !== null) lastHeadingRef.current = heading;
    onInput({
      screenHeadingRadians: heading ?? lastHeadingRef.current,
      throttle,
    });
  };

  const emitKeyboard = () => {
    const keys = keyboardRef.current;
    const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    const y = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
    const moving = x !== 0 || y !== 0;
    const length = Math.hypot(x, y) || 1;
    const normalizedX = x / length;
    const normalizedY = y / length;
    setKnob(moving ? { x: normalizedX * 27, y: normalizedY * 27 } : knob);
    emitDirection(normalizedX, normalizedY, moving ? 1 : 0);
  };

  const stopPush = () => {
    setActiveDirection(null);
    onInput({
      screenHeadingRadians: lastHeadingRef.current,
      throttle: 0,
    });
  };

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = padRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.35);
    let x = event.clientX - (bounds.left + bounds.width / 2);
    let y = event.clientY - (bounds.top + bounds.height / 2);
    const length = Math.hypot(x, y);
    if (length > radius) {
      x = (x / length) * radius;
      y = (y / length) * radius;
    }
    const strength = Math.min(1, length / radius);
    if (strength < 0.1) {
      setKnob({ x: 0, y: 0 });
      stopPush();
      return;
    }
    setKnob({ x, y });
    const heading = screenHeadingFromControllerVector(x, y);
    if (heading !== null) {
      const quarter = Math.round(heading / (Math.PI / 2));
      setActiveDirection(
        quarter === 0
          ? 'up'
          : Math.abs(quarter) === 2
            ? 'down'
            : quarter > 0
              ? 'right'
              : 'left',
      );
    }
    emitDirection(x, y, strength);
  };

  useEffect(() => {
    if (mode === 'manual') return;
    keyboardRef.current.clear();
    setKnob({ x: 0, y: 0 });
    lastHeadingRef.current = null;
    onInput(ZERO_INPUT);
  }, [mode, onInput]);

  useEffect(
    () => () => {
      orbitEndRef.current();
    },
    [],
  );

  const startViewOrbit = () => {
    if (viewOrbitingRef.current) return;
    viewOrbitingRef.current = true;
    setViewOrbiting(true);
    onViewOrbitStart();
  };

  const stopViewOrbit = () => {
    if (!viewOrbitingRef.current) return;
    viewOrbitingRef.current = false;
    setViewOrbiting(false);
    onViewOrbitEnd();
  };

  return (
    <section
      className="sg-desktop-roam-console"
      data-theme={theme}
      data-shell-tone={shellTone}
      aria-label="桌面漫游模拟器"
      data-ignore-map-destination
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <header>
        <span>
          <b>DESKTOP ROAM</b>
          <small>人物与搭子同步</small>
        </span>
        {theme === 'retro' && (
          <span className="sg-desktop-roam-shell-picker" role="group" aria-label="选择掌机外壳颜色">
            <button
              type="button"
              className="is-gray"
              aria-label="灰色外壳"
              aria-pressed={shellTone === 'gray'}
              onClick={() => setShellTone('gray')}
            />
            <button
              type="button"
              className="is-purple"
              aria-label="紫色外壳"
              aria-pressed={shellTone === 'purple'}
              onClick={() => setShellTone('purple')}
            />
          </span>
        )}
        <span className="sg-desktop-roam-safety" aria-label="模拟器不会计入真实步数">
          NO GPS · 0 STEPS
        </span>
        <button type="button" onClick={onClose} aria-label="收起桌面漫游模拟器">
          ×
        </button>
      </header>

      <div className="sg-desktop-roam-mode" role="group" aria-label="选择漫游操控方式">
        <button
          type="button"
          className={mode === 'auto' ? 'is-active' : ''}
          aria-pressed={mode === 'auto'}
          onClick={() => onModeChange('auto')}
        >
          自动巡游
        </button>
        <button
          type="button"
          className={mode === 'manual' ? 'is-active' : ''}
          aria-pressed={mode === 'manual'}
          onClick={() => onModeChange('manual')}
        >
          手动操控
        </button>
      </div>

      <div className="sg-desktop-roam-deck">
        <div className="sg-desktop-roam-grip" aria-hidden="true">•••</div>
        <div className="sg-desktop-roam-left-controls">
          {theme === 'retro' && (
            <div className="sg-desktop-roam-mini-keys" aria-label="掌机快捷键">
              <button type="button" onClick={onView}><kbd>MAP</kbd><small>视角</small></button>
              <button type="button" onClick={onRecenter}><kbd>SELECT</kbd><small>归位</small></button>
              <button type="button" onClick={onCruiseToggle} disabled={mode !== 'manual'}>
                <kbd>START</kbd><small>走停</small>
              </button>
            </div>
          )}
          <div
            ref={padRef}
            className="sg-desktop-roam-pad"
            role="application"
            tabIndex={0}
            aria-label="拖动十字方向盘确定人物朝向并前进；方向与人物朝向一一对应，也可使用方向键"
            aria-disabled={mode !== 'manual'}
            onPointerDown={(event) => {
              if (mode !== 'manual') return;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateFromPointer(event);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              stopPush();
            }}
            onPointerCancel={stopPush}
            onLostPointerCapture={stopPush}
            onKeyDown={(event) => {
              if (mode !== 'manual' || !event.key.startsWith('Arrow')) return;
              event.preventDefault();
              keyboardRef.current.add(event.key);
              emitKeyboard();
            }}
            onKeyUp={(event) => {
              if (!event.key.startsWith('Arrow')) return;
              event.preventDefault();
              keyboardRef.current.delete(event.key);
              emitKeyboard();
            }}
            onBlur={() => {
              keyboardRef.current.clear();
              stopPush();
            }}
          >
            {theme === 'retro' ? (
              <span className="sg-desktop-roam-dpad" aria-hidden="true">
                <i className={`is-up${activeDirection === 'up' ? ' is-pressed' : ''}`} />
                <i className={`is-right${activeDirection === 'right' ? ' is-pressed' : ''}`} />
                <i className={`is-down${activeDirection === 'down' ? ' is-pressed' : ''}`} />
                <i className={`is-left${activeDirection === 'left' ? ' is-pressed' : ''}`} />
                <i className="is-center" />
              </span>
            ) : (
              <>
                <span className="sg-desktop-roam-axis is-horizontal" aria-hidden="true" />
                <span className="sg-desktop-roam-axis is-vertical" aria-hidden="true" />
                <span className="sg-desktop-roam-direction is-forward">向前</span>
                <span className="sg-desktop-roam-direction is-back">向后</span>
                <span className="sg-desktop-roam-direction is-left">向左</span>
                <span className="sg-desktop-roam-direction is-right">向右</span>
                <span
                  className="sg-desktop-roam-knob"
                  style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
                  aria-hidden="true"
                />
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          className={`sg-desktop-roam-screen${cruiseActive ? ' is-active' : ''}`}
          disabled={mode !== 'manual'}
          aria-label={cruiseActive ? '停止持续行走' : '开启持续行走'}
          aria-pressed={cruiseActive}
          onClick={onCruiseToggle}
        >
          <i aria-hidden="true">{cruiseActive ? '■' : '▶'}</i>
          <b>{mode === 'auto' ? '自动巡游中' : cruiseActive ? '停止行走' : '持续行走'}</b>
          <span>{mode === 'auto' ? '切换手动后可用' : '按一次开始 · 再按停止'}</span>
        </button>

        <div className="sg-desktop-roam-actions" aria-label="漫游快捷功能">
          <button type="button" className="is-interact" onClick={onInteract}>
            <kbd>Y</kbd><small>互动</small>
          </button>
          <button type="button" className="is-close" onClick={onClose}>
            <kbd>B</kbd><small>收起</small>
          </button>
          <button type="button" className="is-plant" onClick={onPlant} disabled={!canPlant}>
            <kbd>A</kbd><small>种下</small>
          </button>
          <button type="button" className="is-view" onClick={onView}>
            <kbd>X</kbd><small>视角</small>
          </button>
          <button
            type="button"
            className={`is-orbit${viewOrbiting ? ' is-active' : ''}`}
            aria-label="按住视角摇杆缓慢旋转地图"
            aria-pressed={viewOrbiting}
            title="按住环视，松手停止"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              startViewOrbit();
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              stopViewOrbit();
            }}
            onPointerCancel={stopViewOrbit}
            onLostPointerCapture={stopViewOrbit}
            onKeyDown={(event) => {
              if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                event.preventDefault();
                startViewOrbit();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                stopViewOrbit();
              }
            }}
            onBlur={stopViewOrbit}
          >
            <kbd aria-hidden="true">↻</kbd><small>环视</small>
          </button>
        </div>
        <div className="sg-desktop-roam-grip" aria-hidden="true">•••</div>
      </div>
    </section>
  );
}

import { useSyncExternalStore } from 'react';
import { SoundWalkCanvas } from '../integrations/soundWalk';
import RunRouteOverlay from './RunRouteOverlay';
import { getActiveRunRouteSessionId, subscribeRunRouteOpen } from '../lib/runRouteSkill';
import './EarthSoundWalkTab.css';

/**
 * Pocket Earth 中间 Tab 的唯一入口。
 *
 * 城市花草、观鸟手帐和高德地图都由原 SOUND WALK 画布提供；
 * Pocket Buddy 的跑步能力只能通过 renderMapOverlay 叠加，不能替换原地图。
 */
export default function EarthSoundWalkTab() {
  const routeSessionId = useSyncExternalStore(
    subscribeRunRouteOpen,
    getActiveRunRouteSessionId,
    () => null,
  );

  return (
    <div className="pocket-earth-soundwalk-host flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-[30px] shrink-0 items-center justify-center border-b-2 border-black bg-[#EAEAEA] px-4">
        <div className="truncate font-pixel text-[9px] uppercase leading-none tracking-[0.14em]">POCKET EARTH · CITY MAP</div>
      </div>
      <div className="min-h-0 flex-1">
        <SoundWalkCanvas
          workspace="city"
          journalContent="nature-deck"
          renderMapOverlay={(map) => routeSessionId
            ? <RunRouteOverlay map={map} sessionId={routeSessionId} />
            : null}
        />
      </div>
    </div>
  );
}

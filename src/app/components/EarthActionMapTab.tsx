import { useEffect, useState } from 'react';
import SourceMyMapTab from '../../../vendor/legacy-city/src/app/components/MyMapTab';
import RunRouteOverlay from './RunRouteOverlay';
import { getActiveRunRouteSessionId, subscribeRunRouteOpen } from '../lib/runRouteSkill';
import { subscribeVoiceMapMode } from '../../../vendor/legacy-city/src/app/lib/location/voiceMapMode';

/**
 * Pocket Earth 中间 Tab 的固定入口：始终使用原城市花草地图，
 * 跑步路线只通过 overlay 叠加，不得用独立高德地图替换它。
 */
export default function EarthActionMapTab() {
  const [routeSessionId, setRouteSessionId] = useState(getActiveRunRouteSessionId);
  const [routeHidden, setRouteHidden] = useState(false);

  useEffect(() => subscribeRunRouteOpen(id => { setRouteSessionId(id); setRouteHidden(false); }), []);
  useEffect(() => subscribeVoiceMapMode(request => {
    if (request?.status === 'opening') setRouteSessionId(null);
  }), []);

  return (
    <SourceMyMapTab
      workspace="city"
      journalContent="nature-deck"
      pocketEarthMode
      renderMapOverlay={(map) => routeSessionId
        ? <RunRouteOverlay key={routeSessionId} map={map} sessionId={routeSessionId} collapsed={routeHidden} onExpand={() => setRouteHidden(false)} onClose={() => setRouteHidden(true)} />
        : null}
    />
  );
}

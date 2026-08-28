// Mapping 中“种诗 / 城市诗园”的共享入口。
// 种诗管理个人种子与植物记录；城市诗园只呈现用户已种下的真实落位。
import { useEffect, useState } from 'react';
import { subscribeGarden } from '../lib/poemtree/garden';
import { subscribePocketPlantings } from '../lib/pocket-plants/planting';
import CityPlantingMap from './CityPlantingMap';
import PoemPlantHub from './PoemPlantHub';
import PoemTreePage from './PoemTreePage';

type View = { kind: 'garden' } | { kind: 'tree'; id: string; arrived?: boolean };

export default function PoemGardenPage({
  initialTreeId,
  mode = 'personal',
}: {
  initialTreeId?: string | null;
  mode?: 'personal' | 'city';
}) {
  const [, refresh] = useState(0);
  const [view, setView] = useState<View>(
    initialTreeId
      ? { kind: 'tree', id: initialTreeId, arrived: true }
      : { kind: 'garden' },
  );

  useEffect(() => {
    const offGarden = subscribeGarden(() => refresh((value) => value + 1));
    const offPlantings = subscribePocketPlantings(() => refresh((value) => value + 1));
    return () => {
      offGarden();
      offPlantings();
    };
  }, []);

  if (view.kind === 'tree') {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-[#EAEAEA] px-4 py-3">
        <PoemTreePage
          treeId={view.id}
          arrived={view.arrived}
          onBack={() => setView({ kind: 'garden' })}
        />
      </div>
    );
  }

  if (mode === 'personal') {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-[#EAEAEA] px-4 py-3">
        <PoemPlantHub />
      </div>
    );
  }

  return <CityPlantingMap />;
}

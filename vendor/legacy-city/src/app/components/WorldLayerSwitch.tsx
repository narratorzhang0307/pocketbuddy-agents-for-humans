import { BookOpen, Route, Sprout, UsersRound, Waves } from 'lucide-react';
import {
  WorkspacePrimaryTab,
  WorkspacePrimaryTabs,
} from './WorkspaceTabShell';

export type StreetWorkspaceView = '种植物' | '街头' | '手帐';

interface WorldLayerSwitchProps {
  value: StreetWorkspaceView;
  onChange: (view: StreetWorkspaceView) => void;
  journalMode?: 'journal' | 'nature-deck';
  mode?: 'default' | 'health-ledger';
}

const OPTIONS: Array<{
  value: StreetWorkspaceView;
  label: string;
  english: string;
  icon: typeof UsersRound;
}> = [
  {
    value: '种植物',
    label: '种植物',
    english: 'CITY PLANTS',
    icon: Sprout,
  },
  {
    value: '街头',
    label: '街头',
    english: 'PUBLIC STREET',
    icon: UsersRound,
  },
  {
    value: '手帐',
    label: '观鸟手帐',
    english: 'BIRD JOURNAL',
    icon: BookOpen,
  },
];

export default function WorldLayerSwitch({
  value,
  onChange,
  journalMode = 'journal',
  mode = 'default',
}: WorldLayerSwitchProps) {
  const options = mode === 'health-ledger'
    ? [
        { value: '种植物' as const, label: '树', english: 'TREES', icon: Sprout },
        { value: '街头' as const, label: '行动地图', english: 'ROUTES', icon: Route },
        { value: '手帐' as const, label: '自然时刻', english: 'MOMENTS', icon: Waves },
      ]
    : OPTIONS;
  return (
    <WorkspacePrimaryTabs
      ariaLabel={mode === 'health-ledger' ? 'Earth 行动账本' : '街道工作区'}
      className="bg-[#f3ecd7]"
    >
      {options.map((option) => {
        const resolved = mode === 'health-ledger'
          ? option
          : journalMode === 'nature-deck'
          ? option.value === '手帐'
            ? { ...option, label: '自然图鉴', english: 'NATURE DECK' }
            : option.value === '街头'
              ? { ...option, label: '运动', english: 'MOVE' }
              : option
          : option;
        return (
        <WorkspacePrimaryTab
          key={resolved.value}
          active={resolved.value === value}
          english={resolved.english}
          icon={resolved.icon}
          label={resolved.label}
          onClick={() => onChange(resolved.value)}
        />
        );
      })}
    </WorkspacePrimaryTabs>
  );
}

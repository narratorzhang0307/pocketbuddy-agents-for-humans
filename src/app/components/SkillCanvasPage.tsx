import { Component, lazy, Suspense, type ReactNode } from 'react';

const SkillCanvasEditor = lazy(() => import('./SkillCanvasEditor'));

export function SkillCanvasUnavailable() {
  return <div role="alert" className="p-6 text-sm leading-relaxed">
    新版技能画布暂不可用。旧版已移除，不会回退显示；请更新 App 资源后重试。
  </div>;
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <SkillCanvasUnavailable /> : this.props.children; }
}

export default function SkillCanvasPage({ skillId }: { skillId?: string | null }) {
  return <CanvasBoundary key={skillId || 'new-canvas'}>
    <Suspense fallback={<div role="status" className="p-6 text-sm">正在加载新版技能画布…</div>}>
      <SkillCanvasEditor skillId={skillId} />
    </Suspense>
  </CanvasBoundary>;
}

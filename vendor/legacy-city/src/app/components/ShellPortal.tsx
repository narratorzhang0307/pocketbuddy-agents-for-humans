// 手机壳传送门：把全屏覆盖层钉进 #pe-shell（App 四种外壳的内容根节点）内部——
// 铁律：任何覆盖/放大层都不允许超出手机边界（浏览器手机框、录制壳同理）。
// host 不存在时原地渲染兜底（如单测/极早期挂载）。
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function ShellPortal({ children }: { children: ReactNode }) {
  const host = typeof document !== 'undefined' ? document.getElementById('pe-shell') : null;
  return host ? createPortal(children, host) : <>{children}</>;
}

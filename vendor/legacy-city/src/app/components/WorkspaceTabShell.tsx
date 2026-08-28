import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface WorkspaceTabShellProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  columns?: 3 | 4;
  gridAriaLabel?: string;
  gridClassName?: string;
  sticky?: boolean;
}

export function WorkspacePrimaryTabs({
  ariaLabel,
  children,
  className = '',
  columns = 3,
  gridClassName = '',
}: WorkspaceTabShellProps) {
  return (
    <nav
      data-workspace-primary-tabs
      className={`workspace-primary-tabs shrink-0 border-b-2 border-black px-3 py-2 ${className}`}
      aria-label={ariaLabel}
    >
      <div
        data-workspace-primary-grid
        className={`grid h-[46px] ${columns === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-1 border border-black bg-black p-1 ${gridClassName}`}
      >
        {children}
      </div>
    </nav>
  );
}

export function WorkspacePrimaryTab({
  active,
  english,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  english: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        backgroundColor: active ? '#f6efda' : '#000',
        color: active ? '#000' : 'rgba(0, 255, 136, .65)',
      }}
      className={`flex min-h-[36px] items-center justify-center gap-2 px-2 transition-colors ${
        active
          ? 'bg-[#f6efda] text-black'
          : 'bg-black text-[#00ff88]/65'
      }`}
    >
      <Icon size={15} strokeWidth={2.4} />
      <span className="text-left">
        <strong className="block text-[10px] leading-none">{label}</strong>
        <small className="mt-1 block font-pixel text-[5px] tracking-wider opacity-65">
          {english}
        </small>
      </span>
    </button>
  );
}

export function WorkspaceSecondaryTabs({
  ariaLabel,
  children,
  className = '',
  gridAriaLabel,
  gridClassName = '',
  sticky = false,
}: WorkspaceTabShellProps) {
  return (
    <nav
      data-workspace-secondary-tabs
      className={`workspace-secondary-tabs shrink-0 border-b-2 border-black bg-[#f3ecd7] px-4 py-2.5 ${
        sticky ? 'sticky -top-4 z-20' : ''
      } ${className}`}
      aria-label={ariaLabel}
    >
      <div
        data-workspace-secondary-grid
        aria-label={gridAriaLabel}
        className={`grid h-[48px] grid-cols-3 gap-1 rounded-[18px] border border-black/15 bg-[#e6ddc5] p-1 shadow-[inset_0_1px_2px_rgba(17,17,17,0.12)] ${gridClassName}`}
        role="tablist"
      >
        {children}
      </div>
    </nav>
  );
}

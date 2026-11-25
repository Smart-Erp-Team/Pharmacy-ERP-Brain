import { useLocation } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';
import { BranchContextControl } from './BranchContextControl';
import { NAV_GROUPS } from './navItems';

/**
 * Top bar (DESIGN.md §3.1): 66px high, surface background, bottom border.
 * It carries the current workspace context, never a hardcoded identity.
 */
export function Topbar() {
  const location = useLocation();
  const { organizationCode, runtime } = useAuth();

  const currentLabel =
    NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.path === location.pathname
    )?.label ?? 'Workspace';

  return (
    <header className="border-border bg-surface flex h-[66px] items-center justify-between border-b px-8">
      <span className="text-title text-text">{currentLabel}</span>

      <div className="flex items-center gap-3">
        <BranchContextControl />
        <span className="text-body-sm text-text-secondary">
          {organizationCode ?? 'Organization unavailable'}
        </span>
        <Badge variant="neutral" dot>
          {runtime ?? 'Runtime unavailable'}
        </Badge>
      </div>
    </header>
  );
}

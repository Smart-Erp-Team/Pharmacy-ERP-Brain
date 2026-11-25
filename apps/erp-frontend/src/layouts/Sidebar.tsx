import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';
import { describeBranchScope } from '../lib/auth/permissions';
import { getVisibleNavGroups, NAV_GROUPS } from './navItems';

/**
 * Fixed dark navigation rail (DESIGN.md §3.1 and §3.2): 248px wide, brand first,
 * then the deployment context, the grouped navigation, and the user card.
 */
export function Sidebar() {
  const {
    currentUser,
    runtime,
    branchScope,
    branchIds,
    roles,
    scopes,
    logout,
  } = useAuth();

  const groups = getVisibleNavGroups(NAV_GROUPS, { roles, scopes, runtime });
  const username = currentUser?.username ?? 'Unavailable';
  const roleLabel = roles.length > 0 ? roles.join(', ') : 'Unavailable';
  const branchLabel =
    branchScope === 'ASSIGNED' && branchIds.length === 1
      ? '1 branch assigned'
      : branchScope === 'ASSIGNED'
        ? `${branchIds.length} branches assigned`
        : describeBranchScope(branchScope);

  return (
    <aside className="bg-sidebar fixed top-0 left-0 z-20 flex h-screen w-[248px] flex-col overflow-y-auto px-3.5 pt-6 pb-4">
      <div className="flex items-center gap-2.5 px-2">
        <span className="bg-primary text-body flex h-8 w-8 items-center justify-center rounded-md font-bold text-white">
          F
        </span>
        <div className="flex flex-col">
          <span className="text-title text-white">ForgeERP</span>
          <span className="text-caption text-sidebar-muted">
            Pharmacy operations
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 px-2">
        <Badge variant="info" dot>
          {runtime ?? 'Runtime unavailable'}
        </Badge>
        <span className="text-caption text-sidebar-muted">{branchLabel}</span>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-5">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <span className="text-caption text-sidebar-muted px-2 font-semibold tracking-wide uppercase">
              {group.title}
            </span>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `text-body rounded-sm px-2 py-1.5 font-semibold transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-sidebar-muted hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-5 flex flex-col gap-2 rounded-md bg-white/5 px-3 py-3">
        <span className="text-body-sm font-semibold text-white">
          {username}
        </span>
        <span className="text-caption text-sidebar-muted">{roleLabel}</span>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sidebar-muted text-caption inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Logout
        </button>
      </div>
    </aside>
  );
}

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * The application shell (DESIGN.md §3.1): a fixed 248px navigation rail, a 66px
 * top bar, and a centered content column capped at 1440px. Desktop-first, with a
 * 1180px minimum body width.
 */
export function AppShell() {
  return (
    <div className="bg-background min-h-screen min-w-[1180px]">
      <Sidebar />

      <div className="ml-[248px] flex min-h-screen flex-col">
        <Topbar />

        <main className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

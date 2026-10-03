import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  FolderKanban,
  LayoutDashboard,
  Menu as MenuIcon,
  Plus,
  Repeat,
  Settings,
  Target,
  Timer,
  Trophy,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher'
import { Button } from '@/components/ui'
import { useT, type TranslationKey } from '@/i18n'
import { cn } from '@/utils/cn'

const NAV: { to: string; label: TranslationKey; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: '/', label: 'navDashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'navTasks', icon: CheckSquare },
  { to: '/planner', label: 'navPlanner', icon: CalendarDays },
  { to: '/projects', label: 'navProjects', icon: FolderKanban },
  { to: '/goals', label: 'navGoals', icon: Target },
  { to: '/habits', label: 'navHabits', icon: Repeat },
  { to: '/focus', label: 'navFocus', icon: Timer },
  { to: '/analytics', label: 'navAnalytics', icon: BarChart3 },
  { to: '/reviews', label: 'navReviews', icon: ClipboardCheck },
  { to: '/achievements', label: 'navAchievements', icon: Trophy },
  { to: '/settings', label: 'navSettings', icon: Settings },
]

/**
 * Persistent shell: workspace switcher, navigation, and the routed page.
 *
 * The sidebar is a fixed rail on desktop and a slide-over on narrow screens, so
 * the same navigation serves both without a second component tree.
 */
export function AppShell() {
  const t = useT()
  const [navOpen, setNavOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname])

  // Global shortcuts: `n` opens quick-add, `/` is reserved for page search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'n') {
        event.preventDefault()
        setQuickAddOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Mobile drawer backdrop */}
      {navOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-60 shrink-0 flex-col border-e border-border bg-card shadow-xl transition-transform lg:static lg:!translate-x-0 lg:shadow-none',
          // Off-canvas only below `lg`. Hide-transforms are max-lg-scoped so they
          // cannot override desktop placement (rtl: variants otherwise win and shove
          // the rail off-screen in Persian).
          navOpen ? 'translate-x-0' : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <WorkspaceSwitcher />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('shellCloseNav')}
            className="lg:hidden"
            onClick={() => setNavOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="px-3 pb-2">
          <Button variant="primary" className="w-full" onClick={() => setQuickAddOpen(true)}>
            <Plus className="size-4" />
            {t('shellNewTask')}
            <kbd className="ms-auto rounded bg-black/20 px-1 text-[10px] font-normal">N</kbd>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/12 text-accent'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              {t(item.label)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground">
          {t('shellFooter')}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('shellOpenNav')}
            className="shrink-0"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon className="size-4" />
          </Button>
          <span className="text-sm font-semibold">Momentum OS</span>
          <Button
            variant="primary"
            size="icon-sm"
            aria-label={t('shellNewTask')}
            className="ms-auto"
            onClick={() => setQuickAddOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <QuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  )
}

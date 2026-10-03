import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button, Card, Toaster } from '@/components/ui'
import { useI18n } from '@/i18n'
import { requestPersistentStorage } from '@/database/db'
import { AchievementsPage } from '@/pages/AchievementsPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FocusPage } from '@/pages/FocusPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { HabitsPage } from '@/pages/HabitsPage'
import { PlannerPage } from '@/pages/PlannerPage'
import { ProjectDetailPage } from '@/pages/ProjectDetailPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ReviewsPage } from '@/pages/ReviewsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TasksPage } from '@/pages/TasksPage'
import { useWorkspaceStore } from '@/stores/workspace'

/**
 * Application root.
 *
 * Rendering is gated on `bootstrap()` because every page assumes an active
 * workspace exists; resolving that once here keeps the null-check out of all
 * eleven routes.
 */
export function App() {
  const phase = useWorkspaceStore((s) => s.phase)
  const error = useWorkspaceStore((s) => s.error)
  const bootstrap = useWorkspaceStore((s) => s.bootstrap)
  const language = useI18n((s) => s.language)

  useEffect(() => {
    void bootstrap()
    // Ask once; a local-first app that gets evicted under disk pressure loses data.
    void requestPersistentStorage()
  }, [bootstrap])

  // Keep the browser tab title in the active language.
  useEffect(() => {
    document.title =
      language === 'fa' ? 'Momentum OS — سیستم بهره‌وری شخصی' : 'Momentum OS'
  }, [language])

  if (phase === 'loading') return <SplashScreen />
  if (phase === 'error') return <StartupError message={error ?? 'Momentum OS could not start.'} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="focus" element={<FocusPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

function SplashScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
        <p className="text-sm text-muted-foreground">Opening your workspace…</p>
      </div>
    </div>
  )
}

function StartupError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <Card className="max-w-md p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-400" />
          <div>
            <h1 className="text-sm font-semibold">Momentum OS could not start</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-4" />
              Reload
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

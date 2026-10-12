/**
 * Feature flags for TasksPage.
 * Designed to allow instant and isolated toggle/rollback of any phase:
 * - phase1QuickWins: Debounce, '/' shortcut, Global Stats, Metadata Counts, Undo Toast
 * - phase2Performance: Indexed compound query optimizations and lightweight Virtual List
 * - phase3PowerFeatures: Batch selection toolbar, Group By, Sort By, Nested Subtasks, Keyboard shortcuts
 */
export interface TasksPageFeatureConfig {
  phase1QuickWins: boolean
  phase2Performance: boolean
  phase3PowerFeatures: boolean
}

export const TASKS_PAGE_CONFIG: TasksPageFeatureConfig = {
  phase1QuickWins: true,
  phase2Performance: true,
  phase3PowerFeatures: true,
}

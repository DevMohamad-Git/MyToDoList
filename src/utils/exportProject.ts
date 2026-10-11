import type { Milestone, Project, Task } from '@/types'
import type { ProjectStats } from '@/services/progress'
import { PROJECT_STATUS_LABEL } from '@/config/constants'
import { formatDate, formatDuration } from '@/utils/date'
import { toast } from '@/components/ui'

const HEALTH_FA_LABEL: Record<string, string> = {
  on_track: 'طبق برنامه (On track)',
  at_risk: 'در معرض خطر (At risk)',
  off_track: 'دارای تاخیر (Off track)',
  done: 'تکمیل‌شده (Done)',
  idle: 'غیرفعال (Idle)',
}

/**
 * Builds a markdown summary report for a project.
 */
export function generateProjectMarkdown(
  project: Project,
  stats?: ProjectStats,
  tasks?: Task[],
): string {
  const lines: string[] = []

  lines.push(`# گزارش وضعیت پروژه: ${project.name}`)
  lines.push('')
  if (project.description) {
    lines.push(`> ${project.description}`)
    lines.push('')
  }

  lines.push('## اطلاعات کلی')
  lines.push(`- **وضعیت:** ${PROJECT_STATUS_LABEL[project.status] ?? project.status}`)
  lines.push(`- **اولویت:** ${project.priority}`)
  if (stats) {
    lines.push(`- **شاخص سلامت:** ${HEALTH_FA_LABEL[stats.health] ?? stats.health}`)
    lines.push(`- **درصد پیشرفت:** ${Math.round(stats.progress)}%`)
    lines.push(`- **کارهای باز:** ${stats.openTasks} از ${stats.totalTasks}`)
    lines.push(`- **کارهای دارای تاخیر:** ${stats.overdueTasks}`)
    lines.push(`- **زمان کار شده:** ${formatDuration(stats.actualMinutes)}`)
    lines.push(`- **تخمین باقی‌مانده:** ${formatDuration(stats.remainingEstimateMinutes)}`)
  }
  if (project.deadline) {
    lines.push(`- **سررسید نهایی:** ${formatDate(project.deadline)}`)
  }
  lines.push('')

  if (project.milestones && project.milestones.length > 0) {
    lines.push('## اهداف مرحله‌ای (Milestones)')
    project.milestones.forEach((m: Milestone) => {
      const check = m.completed ? '[x]' : '[ ]'
      const due = m.dueDate ? ` (سررسید: ${formatDate(m.dueDate)})` : ''
      lines.push(`- ${check} ${m.title}${due}`)
    })
    lines.push('')
  }

  if (tasks && tasks.length > 0) {
    lines.push('## لیست تسک‌ها')
    const completedTasks = tasks.filter((t) => t.status === 'completed')
    const openTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')

    if (openTasks.length > 0) {
      lines.push('### تسک‌های در حال انجام و باز:')
      openTasks.forEach((t) => {
        const due = t.dueDate ? ` - سررسید: ${formatDate(t.dueDate)}` : ''
        lines.push(`- [ ] ${t.title}${due}`)
      })
      lines.push('')
    }

    if (completedTasks.length > 0) {
      lines.push('### تسک‌های تکمیل‌شده:')
      completedTasks.forEach((t) => {
        lines.push(`- [x] ${t.title}`)
      })
      lines.push('')
    }
  }

  lines.push(`---`)
  lines.push(`*تولید شده توسط FlowOS در تاریخ ${formatDate(new Date())}*`)

  return lines.join('\n')
}

/**
 * Copies the project summary markdown to clipboard.
 */
export async function copyProjectSummary(
  project: Project,
  stats?: ProjectStats,
  tasks?: Task[],
): Promise<void> {
  const md = generateProjectMarkdown(project, stats, tasks)
  try {
    await navigator.clipboard.writeText(md)
    toast.success(`گزارش پروژه «${project.name}» کپی شد`)
  } catch {
    toast.error('امکان کپی کردن گزارش وجود نداشت')
  }
}

/**
 * Triggers a download of the project summary as a .md file.
 */
export function downloadProjectSummary(
  project: Project,
  stats?: ProjectStats,
  tasks?: Task[],
): void {
  const md = generateProjectMarkdown(project, stats, tasks)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `project-${project.name.toLowerCase().replace(/[\s\W]+/g, '-')}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`فایل گزارش پروژه «${project.name}» دانلود شد`)
}

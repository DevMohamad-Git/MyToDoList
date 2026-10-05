import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button, Input, Menu, Modal, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { cn } from '@/utils/cn'

/** Workspace picker in the sidebar header, plus workspace creation. */
export function WorkspaceSwitcher() {
  const t = useT()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeId = useWorkspaceStore((s) => s.activeId)
  const setActive = useWorkspaceStore((s) => s.setActive)
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const active = workspaces.find((w) => w.id === activeId)

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await createWorkspace({ name: trimmed })
      toast.success(t('wsCreated', { name: trimmed }))
      setCreating(false)
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Menu
        align="left"
        className="min-w-0 flex-1"
        trigger={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-muted/60"
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
              style={{ backgroundColor: active?.color ?? '#6366f1' }}
            >
              {(active?.name ?? '?').charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{active?.name ?? '—'}</span>
              {active?.isDemo ? (
                <span className="block text-[10px] text-muted-foreground">{t('wsDemoData')}</span>
              ) : null}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
        items={[
          ...workspaces.map((workspace) => ({
            label: (
              <span className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: workspace.color }}
                />
                <span className={cn('truncate', workspace.id === activeId && 'font-medium')}>
                  {workspace.name}
                </span>
                {workspace.id === activeId ? <Check className="ms-auto size-3.5" /> : null}
              </span>
            ),
            onSelect: () => void setActive(workspace.id),
          })),
          {
            label: t('wsNewDots'),
            icon: <Plus className="size-3.5" />,
            separated: true,
            onSelect: () => setCreating(true),
          },
        ]}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('wsNewTitle')}
        description={t('wsNewDesc')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('cCancel')}
            </Button>
            <Button variant="primary" onClick={() => void create()} disabled={busy || !name.trim()}>
              {t('cCreate')}
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          placeholder={t('wsNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
        />
      </Modal>
    </>
  )
}

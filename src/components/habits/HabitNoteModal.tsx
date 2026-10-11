import { useEffect, useState } from 'react'
import { Button, Field, Modal, Textarea } from '@/components/ui'
import { useI18n } from '@/i18n'
import type { DayKey, Habit } from '@/types'
import { formatDayLabel } from '@/utils/date'

interface HabitNoteModalProps {
  open: boolean
  onClose: () => void
  habit: Habit | null
  day: DayKey
  currentNote: string
  count: number
  target: number
  unit?: string
  onSave: (note: string) => Promise<void>
}

export function HabitNoteModal({
  open,
  onClose,
  habit,
  day,
  currentNote,
  count,
  target,
  unit,
  onSave,
}: HabitNoteModalProps) {
  const [note, setNote] = useState(currentNote)
  const [busy, setBusy] = useState(false)
  const language = useI18n((s) => s.language)

  useEffect(() => {
    setNote(currentNote)
  }, [currentNote, day, open])

  if (!habit) return null

  const unitLabel = unit ? ` ${unit}` : ''

  async function handleSave() {
    setBusy(true)
    try {
      await onSave(note.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await onSave('')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const isFa = language === 'fa'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isFa ? `یادداشت روزانه: ${habit.title}` : `Daily Note: ${habit.title}`}
      description={`${formatDayLabel(day)} · ${count}/${target}${unitLabel} ${isFa ? 'انجام‌شده' : 'completed'}`}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {currentNote ? (
              <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={busy}>
                {isFa ? 'حذف یادداشت' : 'Delete note'}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {isFa ? 'انصراف' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} disabled={busy}>
              {isFa ? 'ذخیره یادداشت' : 'Save note'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={isFa ? 'یادداشت یا بازخورد این روز' : 'Reflection / Note for this day'}>
          <Textarea
            autoFocus
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isFa
                ? 'مثلاً: ۲۰ صفحه مطالعه با تمرکز عالی، پیاده‌روی در هوای بارانی، حس رضایت...'
                : 'e.g. Read chapter 3 with deep focus, great workout session today...'
            }
          />
        </Field>
      </div>
    </Modal>
  )
}

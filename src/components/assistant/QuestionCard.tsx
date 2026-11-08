import { useState } from 'react'
import { Check, HelpCircle, PenLine, Sparkles } from 'lucide-react'
import { Button, Card, CardBody, Input } from '@/components/ui'
import type { AssistantQuestion } from '@/types/assistant'
import { cn } from '@/utils/cn'

interface QuestionCardProps {
  questions: AssistantQuestion[]
  selectedAnswers?: Record<string, string>
  onSubmit: (answers: Record<string, string>) => void
  disabled?: boolean
}

export function QuestionCard({
  questions,
  selectedAnswers: initialAnswers,
  onSubmit,
  disabled = false,
}: QuestionCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [activeCustomQId, setActiveCustomQId] = useState<string | null>(null)

  const isCompleted = Boolean(initialAnswers && Object.keys(initialAnswers).length > 0)

  const handleSelectOption = (qId: string, option: string) => {
    if (disabled || isCompleted) return
    setAnswers((prev) => ({ ...prev, [qId]: option }))
    if (activeCustomQId === qId) {
      setActiveCustomQId(null)
    }
  }

  const handleCustomSubmit = (qId: string) => {
    const val = customInputs[qId]?.trim()
    if (!val) return
    setAnswers((prev) => ({ ...prev, [qId]: val }))
    setActiveCustomQId(null)
  }

  const allAnswered = questions.every((q) => Boolean(answers[q.id]))

  const handleSubmit = () => {
    if (!allAnswered || disabled || isCompleted) return
    onSubmit(answers)
  }

  return (
    <Card className="my-2 border-accent/25 bg-card/90 shadow-sm">
      <CardBody className="p-3.5 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-accent">
          <HelpCircle className="size-4" />
          <span>برای برنامه‌ریزی دقیق‌تر، لطفاً به سؤالات زیر پاسخ دهید:</span>
        </div>

        <div className="flex flex-col gap-4">
          {questions.map((q, idx) => {
            const currentAnswer = answers[q.id]
            const isCustomOpen = activeCustomQId === q.id

            return (
              <div key={q.id} className="flex flex-col gap-2 rounded-lg bg-muted/30 p-2.5 text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                    {idx + 1}
                  </span>
                  <span>{q.text}</span>
                </div>

                {/* Option chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {q.options.map((opt) => {
                    const isSelected = currentAnswer === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={disabled || isCompleted}
                        onClick={() => handleSelectOption(q.id, opt)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all',
                          isSelected
                            ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                            : 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:bg-muted/70 hover:text-foreground',
                          (disabled || isCompleted) && 'cursor-default opacity-85',
                        )}
                      >
                        {isSelected ? <Check className="size-3" /> : null}
                        <span>{opt}</span>
                      </button>
                    )
                  })}

                  {/* "خودم می‌نویسم" */}
                  {q.allowCustom !== false && !isCompleted ? (
                    <button
                      type="button"
                      disabled={disabled || isCompleted}
                      onClick={() => setActiveCustomQId(isCustomOpen ? null : q.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-accent/40 hover:text-foreground',
                        isCustomOpen ? 'border-accent text-accent' : '',
                      )}
                    >
                      <PenLine className="size-3" />
                      <span>پاسخ دلخواه</span>
                    </button>
                  ) : null}

                  {/* "خودت تصمیم بگیر" */}
                  {q.allowDecideForMe !== false && !isCompleted ? (
                    <button
                      type="button"
                      disabled={disabled || isCompleted}
                      onClick={() => handleSelectOption(q.id, 'تصمیم با خود دستیار')}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-accent/40 hover:text-foreground',
                        currentAnswer === 'تصمیم با خود دستیار' ? 'border-accent bg-accent/10 text-accent' : '',
                      )}
                    >
                      <Sparkles className="size-3" />
                      <span>خودت تصمیم بگیر</span>
                    </button>
                  ) : null}
                </div>

                {/* Custom input box */}
                {isCustomOpen && !isCompleted ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      autoFocus
                      placeholder="پاسخ خود را بنویسید…"
                      value={customInputs[q.id] || ''}
                      onChange={(e) => setCustomInputs({ ...customInputs, [q.id]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCustomSubmit(q.id)
                        }
                      }}
                      className="h-8 text-xs"
                    />
                    <Button size="sm" variant="secondary" onClick={() => handleCustomSubmit(q.id)}>
                      ثبت
                    </Button>
                  </div>
                ) : null}

                {/* Selected custom display */}
                {isCompleted && currentAnswer && !q.options.includes(currentAnswer) ? (
                  <div className="mt-1 text-xs text-accent">
                    پاسخ انتخاب‌شده: <span className="font-semibold">{currentAnswer}</span>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {!isCompleted ? (
          <div className="mt-4 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              disabled={!allAnswered || disabled}
              onClick={handleSubmit}
            >
              <Sparkles className="size-3.5" />
              <span>ثبت پاسخ‌ها و ادامه ساخت</span>
            </Button>
          </div>
        ) : (
          <div className="mt-3 text-start text-xs text-muted-foreground">
            ✓ پاسخ‌ها به دستیار ارسال شد.
          </div>
        )}
      </CardBody>
    </Card>
  )
}

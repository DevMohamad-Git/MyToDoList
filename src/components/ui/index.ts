/**
 * UI primitive barrel.
 *
 * Pages import from `@/components/ui` so the primitive set stays a single,
 * reviewable surface rather than a web of deep paths.
 */

export { Button, IconButton, SegmentedControl } from './Button'
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button'

export { Card, CardBody, CardHeader, PageHeader, Separator, StatTile } from './Card'

export {
  Checkbox,
  Field,
  Input,
  OptionSelect,
  Select,
  Slider,
  Textarea,
  Toggle,
} from './Field'

export {
  Badge,
  ColorDot,
  PriorityBadge,
  PriorityDot,
  ProjectStatusBadge,
  StatusBadge,
  TagBadge,
} from './Badge'

export { ConfirmDialog, Modal } from './Modal'
export type { ModalSize } from './Modal'

export { Menu, Tabs } from './Menu'
export type { MenuItem, TabDef } from './Menu'

export { IntensityCell, ProgressBar, ScoreLabel, ScoreRing } from './Progress'

export { EmptyState, LoadingState, Skeleton } from './EmptyState'

export { Toaster, toast, useToastStore } from './Toast'
export type { Toast, ToastTone } from './Toast'

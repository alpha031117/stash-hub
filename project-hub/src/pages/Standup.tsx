import { useMemo, useState } from 'react'
import { Check, Copy, RotateCcw, Megaphone, RefreshCw } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useStandupStore,
  useStandupScope,
  useStandupConfig,
  STANDUP_GLOBAL_SCOPE,
  type LookbackMode,
} from '@/stores/standupStore'
import { useStandupTasks } from '@/hooks/useStandupTasks'
import { useCompanies } from '@/hooks/useCompanies'
import { LOOKBACK_LABELS, PLACEHOLDERS, renderStandup } from '@/lib/standup'
import type { TaskStatus } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'

const LOOKBACK_OPTIONS: LookbackMode[] = [
  'previous-day',
  'last-workday',
  'last-3-days',
  'last-7-days',
]

const TODO_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Review' },
]

export function Standup() {
  const scope = useStandupScope()
  // key by scope so blockers / manual override reset when switching organizations
  return <StandupForScope key={scope} scope={scope} />
}

function StandupForScope({ scope }: { scope: string }) {
  const { template, lookback, todoStatuses, groupByProject, name } = useStandupConfig(scope)
  const setTemplate = useStandupStore((s) => s.setTemplate)
  const setLookback = useStandupStore((s) => s.setLookback)
  const toggleTodoStatus = useStandupStore((s) => s.toggleTodoStatus)
  const setGroupByProject = useStandupStore((s) => s.setGroupByProject)
  const setName = useStandupStore((s) => s.setName)
  const resetTemplate = useStandupStore((s) => s.resetTemplate)

  const { data: companies = [] } = useCompanies()
  const activeCompany =
    scope === STANDUP_GLOBAL_SCOPE ? null : companies.find((c) => c.id === scope) ?? null
  const scopeLabel = activeCompany?.name ?? 'All companies'

  const [blockers, setBlockers] = useState('')
  const [copied, setCopied] = useState(false)

  const { yesterday, today, isLoading } = useStandupTasks()

  const rendered = useMemo(
    () =>
      renderStandup({
        template,
        yesterday,
        today,
        blockers,
        groupByProject,
        name,
        lookback,
      }),
    [template, yesterday, today, blockers, groupByProject, name, lookback],
  )

  const [override, setOverride] = useState<string | null>(null)
  const output = override ?? rendered
  const dirty = override !== null

  const regenerate = () => setOverride(null)

  const copy = async () => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="size-5" />
        <h1 className="text-xl font-semibold">Stand-up</h1>
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          {activeCompany?.color && (
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: activeCompany.color }}
            />
          )}
          · {scopeLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={template}
                onChange={(e) => setTemplate(scope, e.target.value)}
                rows={9}
                className="font-mono text-xs leading-relaxed"
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {PLACEHOLDERS.map((p) => (
                  <span key={p.token}>
                    <code className="bg-muted px-1 rounded">{p.token}</code>{' '}
                    {p.description}
                  </span>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetTemplate(scope)}
              >
                <RotateCcw className="size-3.5" />
                Reset to default
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Your name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(scope, e.target.value)}
                  placeholder="Alpha"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Yesterday window</Label>
                <Select
                  value={lookback}
                  onValueChange={(v) => v && setLookback(scope, v as LookbackMode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => LOOKBACK_LABELS[v as LookbackMode]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LOOKBACK_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {LOOKBACK_LABELS[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Today statuses</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TODO_STATUS_OPTIONS.map((o) => {
                    const active = todoStatuses.includes(o.value)
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleTodoStatus(scope, o.value)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:bg-muted',
                        )}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={groupByProject}
                  onChange={(e) => setGroupByProject(scope, e.target.checked)}
                  className="size-3.5"
                />
                Group tasks by project
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Extra blockers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                rows={3}
                placeholder="Anything blocking you today that isn't tied to a task?"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Per-task blockers (set on the task) are pulled in automatically.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Preview
              <span className="text-xs font-normal text-muted-foreground">
                {isLoading
                  ? 'loading…'
                  : `${yesterday.length} done · ${today.length} active`}
              </span>
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={regenerate}
                disabled={!dirty}
                title="Regenerate from template"
              >
                <RefreshCw className="size-3.5" />
                Regenerate
              </Button>
              <Button size="sm" onClick={copy}>
                {copied ? (
                  <>
                    <Check className="size-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={output}
              onChange={(e) => setOverride(e.target.value)}
              rows={18}
              className="font-mono text-xs leading-relaxed"
            />
            {dirty && (
              <p className="mt-2 text-xs text-muted-foreground">
                Manual edits — regenerate to discard.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

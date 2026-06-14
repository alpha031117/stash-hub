import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  FileText,
  FolderGit2,
  ListChecks,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react'

import {
  inTauriApp,
  normalizePath,
  useCcProjects,
  useCcProjectDetail,
  useMavisBrain,
  type CcProject,
  type CcSession,
  type CcTask,
  type MavisBrain,
  type MavisProject,
} from '@/hooks/useClaudeCode'
import { Markdown } from '@/components/Markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tab = 'sessions' | 'memory'

function relative(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'unknown'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function ClaudeCode() {
  const { data: projects = [], isLoading, isError, error, refetch } = useCcProjects()
  const { data: brain, isLoading: brainLoading } = useMavisBrain()
  // Derive the active project (default to most-recent registered) rather than
  // syncing via an effect; `selected` only holds an explicit user choice.
  const [selected, setSelected] = useState<string | null>(null)

  // Path → Mavis project. Membership in this map is what "registered" means
  // for this page: we only surface CC projects whose cwd matches a Mavis
  // project's declared `path:` frontmatter field.
  const mavisByPath = useMemo(() => {
    const m = new Map<string, MavisProject>()
    if (brain?.installed) {
      for (const p of brain.projects) {
        if (p.path) m.set(normalizePath(p.path), p)
      }
    }
    return m
  }, [brain])

  const registered = useMemo(
    () => projects.filter((p) => mavisByPath.has(normalizePath(p.path))),
    [projects, mavisByPath],
  )

  // Drop a stale `selected` (e.g. project was unregistered since last visit).
  const activeSlug =
    (selected && registered.some((p) => p.slug === selected) ? selected : registered[0]?.slug) ??
    null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="size-5" />
          <h1 className="text-xl font-semibold">Stasher's Memory</h1>
          <span className="text-sm text-muted-foreground">· registered projects</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      {!inTauriApp ? (
        <Card>
          <CardContent className="py-10 text-center space-y-1">
            <p className="text-sm font-medium">Open the StashHub desktop app</p>
            <p className="text-xs text-muted-foreground">
              This view reads Claude Code data from your machine through the Tauri backend, so it
              isn’t available in the browser preview. Run <code>npm run tauri dev</code> or launch the
              installed app.
            </p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not read Claude Code data: {String(error)}
          </CardContent>
        </Card>
      ) : isLoading || brainLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-1">
            <p className="text-sm font-medium">No Claude Code projects found</p>
            <p className="text-xs text-muted-foreground">
              Nothing under <code>~/.claude/projects</code> yet. Use Claude Code in a project and it
              will show up here.
            </p>
          </CardContent>
        </Card>
      ) : !brain?.installed ? (
        <Card>
          <CardContent className="py-10 text-center space-y-1">
            <p className="text-sm font-medium">Mavis brain not installed</p>
            <p className="text-xs text-muted-foreground">
              This page only shows Claude Code projects that are registered in Mavis. Install the{' '}
              <code>/mavis</code> slash command and register your projects there.
            </p>
          </CardContent>
        </Card>
      ) : registered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-1">
            <p className="text-sm font-medium">No registered projects</p>
            <p className="text-xs text-muted-foreground">
              Found {projects.length} Claude Code project{projects.length === 1 ? '' : 's'} on this
              machine, but none match a Mavis project's <code>path:</code>. Register one to surface
              it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 items-start">
          <div className="space-y-1.5 lg:sticky lg:top-4">
            {registered.map((p) => (
              <ProjectItem
                key={p.slug}
                project={p}
                mavis={mavisByPath.get(normalizePath(p.path))!}
                active={p.slug === activeSlug}
                onClick={() => setSelected(p.slug)}
              />
            ))}
          </div>
          {activeSlug ? (
            <ProjectDetail slug={activeSlug} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a project.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectItem({
  project,
  mavis,
  active,
  onClick,
}: {
  project: CcProject
  mavis: MavisProject
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md border p-2.5 transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{mavis.name}</span>
      </div>
      <p className="text-xs text-muted-foreground truncate mt-0.5">{project.path}</p>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
        <span>{project.sessionCount} session{project.sessionCount === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>{relative(project.lastActivity)}</span>
        {project.hasMemory && (
          <Badge variant="secondary" className="ml-auto">
            <Brain className="size-3" />
            memory
          </Badge>
        )}
      </div>
    </button>
  )
}

function ProjectDetail({ slug }: { slug: string }) {
  const { data, isLoading, isError, error } = useCcProjectDetail(slug)
  const { data: brain } = useMavisBrain()
  const [tab, setTab] = useState<Tab>('sessions')

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading project…</p>
  if (isError || !data)
    return <p className="text-sm text-destructive">Failed to load: {String(error)}</p>

  // A Mavis project whose declared `path:` matches this project's directory.
  const linkedMavis =
    brain?.installed && data.path
      ? brain.projects.find((p) => normalizePath(p.path) === normalizePath(data.path)) ?? null
      : null

  // Memory tab now surfaces only the linked Mavis project's three files.
  const memoryCount = linkedMavis
    ? [linkedMavis.description, linkedMavis.notes, linkedMavis.progress].filter(Boolean).length
    : 0

  const tabs: { id: Tab; label: string; icon: typeof ListChecks; count: number }[] = [
    { id: 'sessions', label: 'Sessions', icon: ListChecks, count: data.sessions.length },
    { id: 'memory', label: 'Memory', icon: Brain, count: memoryCount },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {label}
            <span className="text-xs text-muted-foreground">({count})</span>
          </button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsView sessions={data.sessions} />}
      {tab === 'memory' && <MemoryView brain={brain ?? null} linkedMavis={linkedMavis} />}
    </div>
  )
}

function SessionsView({ sessions }: { sessions: CcSession[] }) {
  if (sessions.length === 0)
    return <p className="text-sm text-muted-foreground py-4">No sessions recorded.</p>
  return (
    <div className="space-y-3">
      {sessions.map((s, i) => (
        <SessionCard key={s.id} session={s} current={i === 0} />
      ))}
    </div>
  )
}

// Pending = anything not completed; show in-progress before not-started.
const pendingRank = (s: string) => (s === 'in_progress' ? 0 : 1)

function SessionCard({ session, current }: { session: CcSession; current: boolean }) {
  const done = session.tasks.filter((t) => t.status === 'completed')
  const pending = session.tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => pendingRank(a.status) - pendingRank(b.status))

  return (
    <Card className={cn(current && 'border-primary/50')}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
            {current && <Badge>current</Badge>}
            <span className="truncate">{session.title ?? 'Untitled session'}</span>
          </CardTitle>
          <span className="text-xs text-muted-foreground shrink-0">
            {relative(session.lastActivity)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {session.tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tracked tasks in this session.</p>
        ) : (
          <>
            <TaskGroup
              label="Done"
              tasks={done}
              icon={CheckCircle2}
              tone="text-emerald-600"
            />
            <TaskGroup
              label="Pending"
              tasks={pending}
              icon={Circle}
              tone="text-muted-foreground"
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TaskGroup({
  label,
  tasks,
  icon: Icon,
  tone,
}: {
  label: string
  tasks: CcTask[]
  icon: IconCmp
  tone: string
}) {
  if (tasks.length === 0) return null
  return (
    <div>
      <p className={cn('text-xs font-medium mb-1 flex items-center gap-1', tone)}>
        <Icon className="size-3.5" />
        {label} ({tasks.length})
      </p>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </div>
  )
}

function TaskRow({ task }: { task: CcTask }) {
  const icon =
    task.status === 'completed' ? (
      <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
    ) : task.status === 'in_progress' ? (
      <CircleDot className="size-3.5 text-amber-500 shrink-0" />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/50 shrink-0" />
    )
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">{icon}</span>
      <span
        className={cn(
          'min-w-0',
          task.status === 'completed' && 'text-muted-foreground line-through',
        )}
      >
        {task.subject}
      </span>
    </li>
  )
}

type IconCmp = React.ComponentType<{ className?: string }>

function Section({
  title,
  icon: Icon,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: IconCmp
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <Icon className="size-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-semibold flex-1 truncate">{title}</CardTitle>
          {subtitle && <span className="text-xs text-muted-foreground shrink-0">{subtitle}</span>}
        </CardHeader>
      </button>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  )
}

// The Memory tab surfaces exactly three files from the Mavis project linked to
// this directory: index.md (Summary), notes.md (Notes/Guardrails), progress.md
// (Progress). Identity, daily memories, the topic index, other projects, and the
// `.claude` auto-memory are intentionally not shown here.
function MemoryView({
  brain,
  linkedMavis,
}: {
  brain: MavisBrain | null
  linkedMavis: MavisProject | null
}) {
  if (!brain?.installed)
    return (
      <div className="text-xs text-muted-foreground border rounded-md p-3 flex items-start gap-2">
        <Sparkles className="size-3.5 mt-0.5 shrink-0" />
        <span>
          Mavis not detected — no <code>~/.claude/commands/mavis.md</code>. Install the{' '}
          <code>/mavis</code> slash command to surface your long-term memory here.
        </span>
      </div>
    )

  if (!linkedMavis)
    return (
      <p className="text-sm text-muted-foreground py-4">
        No Mavis project is linked to this directory. Create one whose <code>path:</code> matches
        this project to see its Summary, Notes, and Progress here.
      </p>
    )

  const { description, notes, progress } = linkedMavis

  if (!description && !notes && !progress)
    return (
      <p className="text-sm text-muted-foreground py-4">
        Linked to {linkedMavis.name}, but its index/notes/progress files are empty.
      </p>
    )

  return (
    <div className="space-y-3">
      {description && (
        <Section title="Summary" icon={FileText} subtitle="index.md" defaultOpen>
          <Markdown text={description} />
        </Section>
      )}
      {notes && (
        <Section title="Notes (Guardrails)" icon={Shield} subtitle="notes.md" defaultOpen>
          <Markdown text={notes} />
        </Section>
      )}
      {progress && (
        <Section title="Progress" icon={CheckCircle2} subtitle="progress.md" defaultOpen>
          <Markdown text={progress} />
        </Section>
      )}
    </div>
  )
}

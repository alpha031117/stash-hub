import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, FolderOpen, Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { useProjects, type Project } from '@/hooks/useProjects'
import { useUiStore } from '@/stores/uiStore'
import { useCompanies } from '@/hooks/useCompanies'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProjectDialog } from '@/components/projects/ProjectDialog'
import { DeleteProjectDialog } from '@/components/projects/DeleteProjectDialog'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'active' | 'on_hold' | 'completed'

const STATUS_LABEL: Record<Project['status'], string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
}

const STATUS_VARIANT: Record<Project['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  on_hold: 'secondary',
  completed: 'outline',
  archived: 'secondary',
}

const STATUS_CLASS: Partial<Record<Project['status'], string>> = {
  completed: 'border-green-500 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
]

function ProjectCard({
  project: p,
  onEdit,
  onDelete,
}: {
  project: Project
  onEdit: (p: Project) => void
  onDelete: (p: Project) => void
}) {
  return (
    <Link
      to={`/projects/${p.id}`}
      className="group relative rounded-lg border p-4 hover:shadow-sm transition-shadow bg-card block"
    >
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-lg"
        style={{ background: p.color ?? '#6366f1' }}
      />
      <div className="flex items-start justify-between gap-2 mt-1">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{p.name}</p>
          {p.description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
          )}
        </div>
        <div className="hidden group-hover:flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(p) }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(p) }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-3">
        <Badge variant={STATUS_VARIANT[p.status]} className={STATUS_CLASS[p.status]}>
          {STATUS_LABEL[p.status]}
        </Badge>
      </div>
    </Link>
  )
}

export function ProjectList() {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const { data: companies = [] } = useCompanies()
  const { data: projects = [], isLoading } = useProjects()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const activeCompany = companies.find((c) => c.id === activeCompanyId)

  if (!activeCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <FolderOpen className="size-10" />
        <p>Select a company from the sidebar to view projects.</p>
      </div>
    )
  }

  const visible = projects.filter(
    (p) =>
      p.status !== 'archived' &&
      (statusFilter === 'all' || p.status === statusFilter),
  )
  const archived = projects.filter((p) => p.status === 'archived')

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          {activeCompany && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <span className="size-2.5 rounded-full" style={{ background: activeCompany.color }} />
              {activeCompany.name}
            </p>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1" /> New project
        </Button>
      </header>

      {/* Filter bar */}
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-1 text-sm rounded-md transition-colors',
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : visible.length === 0 && archived.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border rounded-lg border-dashed">
          <FolderOpen className="size-8" />
          <p className="text-sm">No projects yet — create one to get started.</p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> New project
          </Button>
        </div>
      ) : (
        <>
          {visible.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border rounded-lg border-dashed">
              No projects match this filter
            </div>
          )}

          {/* Archived folder */}
          {archived.length > 0 && (
            <div>
              <button
                onClick={() => setArchiveOpen((o) => !o)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                {archiveOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <Archive className="size-4" />
                Archived
                <span className="bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {archived.length}
                </span>
              </button>

              {archiveOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                  {archived.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onEdit={setEditTarget}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ProjectDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        project={editTarget ?? undefined}
      />
      <DeleteProjectDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        project={deleteTarget}
      />
    </div>
  )
}

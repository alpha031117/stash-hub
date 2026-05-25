import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useProjects } from '@/hooks/useProjects'
import { Board } from '@/components/kanban/Board'

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === projectId)

  if (!projectId) return null

  return (
    <div className="space-y-4 flex flex-col flex-1 min-h-0">
      <header className="flex items-center gap-3">
        <Link
          to="/projects"
          className="inline-flex items-center justify-center size-7 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold leading-none">
            {project?.name ?? 'Project'}
          </h1>
          {project?.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.description}
            </p>
          )}
        </div>
        {project?.color && (
          <span
            className="size-3 rounded-full ml-1"
            style={{ background: project.color }}
          />
        )}
      </header>

      <Board projectId={projectId} />
    </div>
  )
}

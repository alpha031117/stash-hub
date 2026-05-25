import { Search, X } from 'lucide-react'
import { useFilterStore } from '@/stores/filterStore'
import { useTags } from '@/hooks/useTags'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TaskPriority } from '@/hooks/useTasks'

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
}

export function FilterBar() {
  const search = useFilterStore((s) => s.search)
  const priorities = useFilterStore((s) => s.priorities)
  const tagIds = useFilterStore((s) => s.tagIds)
  const setSearch = useFilterStore((s) => s.setSearch)
  const togglePriority = useFilterStore((s) => s.togglePriority)
  const toggleTag = useFilterStore((s) => s.toggleTag)
  const reset = useFilterStore((s) => s.reset)

  const { data: tags = [] } = useTags()
  const hasFilters = search || priorities.length > 0 || tagIds.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="pl-7 h-7 text-sm w-48"
        />
      </div>

      <div className="flex gap-1">
        {PRIORITIES.map((p) => (
          <button
            key={p}
            onClick={() => togglePriority(p)}
            className={cn(
              'text-xs px-2 py-0.5 rounded border transition-opacity',
              PRIORITY_CLASS[p],
              !priorities.includes(p) && 'opacity-50',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => toggleTag(tag.id)}
          className={cn(
            'text-xs px-2 py-0.5 rounded-full border transition-opacity',
            tagIds.includes(tag.id) ? 'opacity-100' : 'opacity-50',
          )}
          style={
            tagIds.includes(tag.id)
              ? { background: tag.color ?? '#6366f1', color: 'white', borderColor: 'transparent' }
              : { borderColor: tag.color ?? '#6366f1', color: tag.color ?? '#6366f1' }
          }
        >
          {tag.name}
        </button>
      ))}

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={reset}>
          <X className="size-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  )
}

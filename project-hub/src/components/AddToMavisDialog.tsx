import { useCallback, useEffect, useState } from 'react'
import { BrainCircuit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRagEvents, useRegisterProject } from '@/hooks/useMavisRag'

const STORAGE_KEY = 'mavis-candidate-snooze'
const PROJECT_TYPES = ['software', 'research', 'writing', 'design', 'other']

type StoredEntry = { until?: number; ignored?: boolean }

function getStored(): Record<string, StoredEntry> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function isSuppressed(path: string): boolean {
  const stored = getStored()
  const entry = stored[path]
  if (!entry) return false
  if (entry.ignored) return true
  if (entry.until) {
    if (Date.now() < entry.until) return true
    // Expired — clean up
    const next = { ...stored }
    delete next[path]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return false
}

export function AddToMavisDialog() {
  const [queue, setQueue] = useState<string[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState('software')
  const [description, setDescription] = useState('')
  const register = useRegisterProject()

  const currentPath = queue[0] ?? null

  const enqueue = useCallback((path: string) => {
    if (isSuppressed(path)) return
    setQueue((q) => (q.includes(path) ? q : [...q, path]))
  }, [])

  useRagEvents((evt) => {
    if (evt.type === 'unregistered_edit') enqueue(evt.path)
  })

  // Reset form whenever the dialog advances to the next queued path
  useEffect(() => {
    if (currentPath) {
      setName(currentPath.split('/').filter(Boolean).at(-1) ?? '')
      setType('software')
      setDescription('')
      register.reset()
    }
  }, [currentPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => setQueue((q) => q.slice(1))

  const handleSnooze = () => {
    if (!currentPath) return
    const stored = getStored()
    stored[currentPath] = { until: Date.now() + 24 * 60 * 60 * 1000 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    dismiss()
  }

  const handleIgnore = () => {
    if (!currentPath) return
    const stored = getStored()
    stored[currentPath] = { ignored: true }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    dismiss()
  }

  const handleAdd = () => {
    if (!currentPath || !name.trim()) return
    register.mutate(
      { path: currentPath, name: name.trim(), type, description },
      { onSuccess: dismiss },
    )
  }

  return (
    <Dialog open={!!currentPath}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="size-4" />
            Add to Mavis?
          </DialogTitle>
          <DialogDescription>
            You're editing files in a project Mavis isn't tracking yet.{' '}
            <code className="bg-muted px-1 rounded text-xs break-all">{currentPath}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="atm-name">Project name</Label>
            <Input
              id="atm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v ?? 'software')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="atm-desc">
              Description{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="atm-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line about this project"
            />
          </div>
          {register.isError && (
            <p className="text-xs text-destructive">
              {register.error instanceof Error
                ? register.error.message
                : 'Registration failed — check the service logs.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleIgnore}
            disabled={register.isPending}
          >
            Ignore
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSnooze}
            disabled={register.isPending}
          >
            Snooze 24h
          </Button>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!name.trim() || register.isPending}
          >
            {register.isPending ? 'Adding…' : 'Add to Mavis'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

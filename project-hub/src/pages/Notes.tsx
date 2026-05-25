import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import {
  AlignLeft,
  Bold,
  ClipboardList,
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  NotebookPen,
  OctagonAlert,
  Quote,
  Search,
  Trash2,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUiStore } from '@/stores/uiStore'
import { useCompanies } from '@/hooks/useCompanies'
import { useNotesStore, NOTES_GLOBAL_SCOPE } from '@/stores/notesStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Task } from '@/hooks/useTasks'

type ProjectRow = { id: string; name: string; company_id: string }
type TaskRow = Task & { projectName: string }

const STATUS_LABEL: Record<Task['status'], string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildTitleHtml(t: TaskRow): string {
  return `<h2>${esc(t.title)}</h2>`
}

function buildDescriptionHtml(t: TaskRow): string {
  const desc = t.description?.trim()
  return desc
    ? `<p>${esc(desc).replace(/\n/g, '<br>')}</p>`
    : '<p><em>(no description)</em></p>'
}

function buildBlockersHtml(t: TaskRow): string {
  const b = t.blockers?.trim()
  return b
    ? `<p><strong>Blocker (${esc(t.title)}):</strong> ${esc(b)}</p>`
    : `<p><em>(no blockers on ${esc(t.title)})</em></p>`
}

function buildFullHtml(t: TaskRow): string {
  const parts: string[] = []
  parts.push(`<h2>${esc(t.title)}</h2>`)
  const meta = [t.projectName, STATUS_LABEL[t.status], t.priority]
  if (t.completed_at) meta.push(`completed ${format(parseISO(t.completed_at), 'd/M/yyyy')}`)
  parts.push(`<p><em>${esc(meta.join(' · '))}</em></p>`)
  if (t.description?.trim()) {
    parts.push(`<p>${esc(t.description.trim()).replace(/\n/g, '<br>')}</p>`)
  }
  if (t.blockers?.trim()) {
    parts.push(`<p><strong>Blocker:</strong> ${esc(t.blockers.trim())}</p>`)
  }
  return parts.join('')
}

export function Notes() {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const scope = activeCompanyId ?? NOTES_GLOBAL_SCOPE
  // key by scope so the editor remounts when switching organizations
  return <NotesForScope key={scope} scope={scope} />
}

function NotesForScope({ scope }: { scope: string }) {
  const { data: companies = [] } = useCompanies()
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const activeCompany = companies.find((c) => c.id === activeCompanyId)

  const initialNote = useNotesStore((s) => s.notesByScope[scope] ?? '')
  const setNote = useNotesStore((s) => s.setNote)
  const clearNote = useNotesStore((s) => s.clearNote)

  const userId = useAuth((s) => s.session?.user.id)
  const [search, setSearch] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Latest upload handler — paste handler in editorProps is captured once at
  // mount, so it reads the ref to always see current state/editor.
  const uploadImageRef = useRef<((file: File) => void) | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Image,
    ],
    content: initialNote,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        'data-placeholder': 'Jot down thoughts, meeting notes, scratch work…',
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              uploadImageRef.current?.(file)
              return true
            }
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      setNote(scope, editor.getHTML())
    },
  })

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*')
      if (error) throw error
      return data as Task[]
    },
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['all-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, company_id')
      if (error) throw error
      return data as ProjectRow[]
    },
  })

  const tasksWithProject: TaskRow[] = useMemo(() => {
    const projectMap = new Map(projects.map((p) => [p.id, p]))
    return tasks
      .map((t) => {
        const p = projectMap.get(t.project_id)
        if (!p) return null
        if (activeCompanyId && p.company_id !== activeCompanyId) return null
        return { ...t, projectName: p.name }
      })
      .filter((t): t is TaskRow => t !== null)
  }, [tasks, projects, activeCompanyId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasksWithProject
    return tasksWithProject.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.projectName.toLowerCase().includes(q),
    )
  }, [tasksWithProject, search])

  const insertHtml = (html: string) => {
    editor?.chain().focus().insertContent(html).run()
  }

  const insertLink = () => {
    const url = linkUrl.trim()
    if (!url || !editor) return
    if (linkText.trim()) {
      editor.chain().focus().insertContent(`<a href="${esc(url)}">${esc(linkText.trim())}</a> `).run()
    } else if (!editor.state.selection.empty) {
      editor.chain().focus().setLink({ href: url }).run()
    } else {
      editor.chain().focus().insertContent(`<a href="${esc(url)}">${esc(url)}</a> `).run()
    }
    setLinkOpen(false)
    setLinkText('')
    setLinkUrl('')
  }

  const uploadAndInsertImage = async (file: File) => {
    if (!editor) return
    if (!userId) {
      setImageError('You must be signed in to upload images.')
      return
    }
    setImageUploading(true)
    setImageError(null)
    try {
      const extFromName = file.name.includes('.')
        ? file.name.split('.').pop()!.toLowerCase()
        : null
      const extFromMime = file.type.split('/')[1]?.replace('jpeg', 'jpg')
      const ext = extFromName || extFromMime || 'png'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('note-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('note-images').getPublicUrl(path)
      const alt = file.name ? file.name.replace(/\.[^.]+$/, '') : 'pasted image'
      editor.chain().focus().setImage({ src: data.publicUrl, alt }).run()
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setImageUploading(false)
    }
  }
  uploadImageRef.current = (file) => {
    void uploadAndInsertImage(file)
  }

  const handlePickImage = () => {
    setImageError(null)
    fileInputRef.current?.click()
  }

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void uploadAndInsertImage(file)
  }

  const handleClear = () => {
    clearNote(scope)
    editor?.commands.setContent('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5" />
          <h1 className="text-xl font-semibold">Notes</h1>
          <span className="text-sm text-muted-foreground">
            {activeCompany ? `· ${activeCompany.name}` : '· All companies'}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClear} disabled={!initialNote}>
          <Trash2 className="size-3.5" />
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 items-start">
        <Card className="lg:sticky lg:top-4">
          <CardHeader className="pb-2 space-y-2">
            <CardTitle className="text-sm font-semibold">Tasks</CardTitle>
            <div className="relative">
              <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-7"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[60vh] overflow-y-auto space-y-2">
            {tasksLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks match.</p>
            ) : (
              filtered.map((t) => (
                <TaskInsertCard key={t.id} task={t} onInsert={insertHtml} />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-semibold">Notepad</CardTitle>
            <span className="text-xs text-muted-foreground">Auto-saved locally</span>
          </CardHeader>
          <CardContent className="space-y-2">
            <Toolbar
              editor={editor}
              linkOpen={linkOpen}
              imageUploading={imageUploading}
              onToggleLink={() => setLinkOpen((v) => !v)}
              onPickImage={handlePickImage}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelected}
            />

            {linkOpen && (
              <div className="flex flex-wrap items-center gap-1.5 border rounded-md p-2 bg-muted/40">
                <Input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Link text (optional)"
                  className="flex-1 min-w-[8rem]"
                />
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 min-w-[10rem]"
                />
                <Button size="sm" onClick={insertLink} disabled={!linkUrl.trim()}>
                  Insert
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
                  Cancel
                </Button>
              </div>
            )}

            {imageError && (
              <p className="text-xs text-destructive">{imageError}</p>
            )}

            <div className="border rounded-md px-3 py-2">
              <EditorContent editor={editor} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && 'bg-muted text-foreground')}
    >
      {children}
    </Button>
  )
}

function Toolbar({
  editor,
  linkOpen,
  imageUploading,
  onToggleLink,
  onPickImage,
}: {
  editor: Editor | null
  linkOpen: boolean
  imageUploading: boolean
  onToggleLink: () => void
  onPickImage: () => void
}) {
  if (!editor) {
    return <div className="h-8 border rounded-md" />
  }
  const run = (fn: (e: Editor) => void) => () => {
    fn(editor)
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5 border rounded-md p-1">
      <ToolButton title="Bold" active={editor.isActive('bold')} onClick={run((e) => e.chain().focus().toggleBold().run())}>
        <Bold className="size-3.5" />
      </ToolButton>
      <ToolButton title="Italic" active={editor.isActive('italic')} onClick={run((e) => e.chain().focus().toggleItalic().run())}>
        <Italic className="size-3.5" />
      </ToolButton>
      <ToolButton title="Inline code" active={editor.isActive('code')} onClick={run((e) => e.chain().focus().toggleCode().run())}>
        <Code className="size-3.5" />
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      <ToolButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={run((e) => e.chain().focus().toggleHeading({ level: 1 }).run())}>
        <Heading1 className="size-3.5" />
      </ToolButton>
      <ToolButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={run((e) => e.chain().focus().toggleHeading({ level: 2 }).run())}>
        <Heading2 className="size-3.5" />
      </ToolButton>
      <ToolButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={run((e) => e.chain().focus().toggleHeading({ level: 3 }).run())}>
        <Heading3 className="size-3.5" />
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      <ToolButton title="Bullet list" active={editor.isActive('bulletList')} onClick={run((e) => e.chain().focus().toggleBulletList().run())}>
        <List className="size-3.5" />
      </ToolButton>
      <ToolButton title="Numbered list" active={editor.isActive('orderedList')} onClick={run((e) => e.chain().focus().toggleOrderedList().run())}>
        <ListOrdered className="size-3.5" />
      </ToolButton>
      <ToolButton title="Quote" active={editor.isActive('blockquote')} onClick={run((e) => e.chain().focus().toggleBlockquote().run())}>
        <Quote className="size-3.5" />
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      <ToolButton title="Insert link" active={linkOpen || editor.isActive('link')} onClick={onToggleLink}>
        <LinkIcon className="size-3.5" />
      </ToolButton>
      <ToolButton
        title={imageUploading ? 'Uploading…' : 'Insert image'}
        active={imageUploading}
        onClick={onPickImage}
      >
        <ImageIcon className="size-3.5" />
      </ToolButton>
    </div>
  )
}

function TaskInsertCard({
  task,
  onInsert,
}: {
  task: TaskRow
  onInsert: (html: string) => void
}) {
  return (
    <div className="border rounded-md p-2 space-y-1.5 bg-background">
      <div>
        <p className="text-sm font-medium leading-tight">{task.title}</p>
        <p className="text-xs text-muted-foreground">
          {task.projectName} · {STATUS_LABEL[task.status]}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(buildTitleHtml(task))}>
          <AlignLeft className="size-3" />
          Title
        </Button>
        <Button size="xs" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(buildDescriptionHtml(task))}>
          <FileText className="size-3" />
          Description
        </Button>
        <Button size="xs" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(buildBlockersHtml(task))}>
          <OctagonAlert className="size-3" />
          Blockers
        </Button>
        <Button size="xs" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(buildFullHtml(task))}>
          <ClipboardList className="size-3" />
          Full block
        </Button>
      </div>
    </div>
  )
}

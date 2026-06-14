import { useEffect, useRef, useState } from 'react'
import { Brain, Loader2, MessageSquare, RefreshCw, Send } from 'lucide-react'

import { type ChatMessage, streamChat, useRagProjects, useRagStatus } from '@/hooks/useMavisRag'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Message = ChatMessage & { id: number }

let _nextId = 1
function nextId() {
  return _nextId++
}

function ServiceOffline() {
  return (
    <Card>
      <CardContent className="py-10 text-center space-y-2">
        <p className="text-sm font-medium">mavis-rag service not running</p>
        <p className="text-xs text-muted-foreground">
          Start it with{' '}
          <code className="bg-muted px-1 rounded">python -m mavis_rag serve</code> in{' '}
          <code className="bg-muted px-1 rounded">C:\Users\alpha\Documents\Self\mavis-rag</code>.
        </p>
      </CardContent>
    </Card>
  )
}

function ProjectFilter({
  projects,
  value,
  onChange,
}: {
  projects: string[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-8 rounded-md border bg-background px-2 text-xs text-muted-foreground"
    >
      <option value="">All projects</option>
      {projects.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs text-primary-foreground">
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ content, streaming }: { content: string; streaming: boolean }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="size-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Brain className="size-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
        {content ? (
          <Markdown text={content} />
        ) : (
          <span className="flex gap-1 items-center text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </span>
        )}
        {streaming && content && (
          <span className="inline-block w-1 h-3 bg-muted-foreground/50 ml-0.5 animate-pulse" />
        )}
      </div>
    </div>
  )
}

const STARTERS = [
  'What did I work on last week?',
  'Give me a timeline for the stash project.',
  'What was the PayEx callback issue?',
  'Which projects shipped something in May?',
]

export function Chat() {
  const { data: status, isError: statusError } = useRagStatus()
  const { data: projectsData } = useRagProjects()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [project, setProject] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const projects = projectsData?.projects.map((p) => p.name) ?? []

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  function send(text = input.trim()) {
    if (!text || streaming) return

    const userMsg: Message = { id: nextId(), role: 'user', content: text }
    const assistantMsg: Message = { id: nextId(), role: 'assistant', content: '' }

    const prevHistory: ChatMessage[] = messages.map(({ role, content }) => ({ role, content }))

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    const assistantId = assistantMsg.id

    cleanupRef.current = streamChat(
      text,
      prevHistory,
      project,
      (token) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m)),
        )
      },
      () => setStreaming(false),
      (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${err}` } : m,
          ),
        )
        setStreaming(false)
      },
    )
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function clear() {
    cleanupRef.current?.()
    setMessages([])
    setStreaming(false)
  }

  // Not running or error fetching status
  if (statusError || (status && !status.brain_found && status.chunks === 0)) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <Header projects={projects} project={project} onProjectChange={setProject} onClear={clear} hasMessages={false} />
        <ServiceOffline />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <Header
        projects={projects}
        project={project}
        onProjectChange={setProject}
        onClear={clear}
        hasMessages={messages.length > 0}
      />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Brain className="size-10 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Ask anything about your work history</p>
              <p className="text-xs text-muted-foreground">
                {status
                  ? `${status.chunks} chunks · ${status.checkpoints} checkpoints indexed`
                  : 'Connecting to mavis-rag…'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} content={m.content} />
              ) : (
                <AssistantBubble
                  key={m.id}
                  content={m.content}
                  streaming={streaming && m.id === messages[messages.length - 1]?.id}
                />
              ),
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <div className="flex gap-2 items-end border rounded-xl p-2 bg-background shadow-sm shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your work history… (Shift+Enter for new line)"
          rows={1}
          disabled={streaming}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60',
            'min-h-[32px] leading-relaxed px-2 py-1',
          )}
        />
        <Button
          size="sm"
          onClick={() => send()}
          disabled={!input.trim() || streaming}
          className="shrink-0"
        >
          {streaming ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}

function Header({
  projects,
  project,
  onProjectChange,
  onClear,
  hasMessages,
}: {
  projects: string[]
  project: string | null
  onProjectChange: (v: string | null) => void
  onClear: () => void
  hasMessages: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-5" />
        <h1 className="text-xl font-semibold">Mavis Chat</h1>
        <span className="text-sm text-muted-foreground">· RAG over your brain</span>
      </div>
      <div className="flex items-center gap-2">
        {projects.length > 0 && (
          <ProjectFilter projects={projects} value={project} onChange={onProjectChange} />
        )}
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <RefreshCw className="size-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}

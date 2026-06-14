import { cn } from '@/lib/utils'

// Inline markdown within a single line: **bold**, `code`, [text](url).
// Links reference brain-relative paths that aren't navigable, so we render
// the label text only (underlined for visual distinction).
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1]) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">
          {m[2]}
        </strong>,
      )
    } else if (m[3]) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground"
        >
          {m[4]}
        </code>,
      )
    } else if (m[5]) {
      nodes.push(
        <span key={`${keyPrefix}-l${i}`} className="text-foreground underline underline-offset-2">
          {m[6]}
        </span>,
      )
    }
    last = re.lastIndex
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// Lightweight markdown renderer for brain content. Not a full CommonMark engine —
// handles headings (as bold), bold, inline code, fenced code, bullets, ordered
// lists, horizontal rules, and leading YAML frontmatter.
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  // Leading YAML frontmatter → dimmed key/value block instead of stray '---'.
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) {
      const fm = lines.slice(1, end)
      blocks.push(
        <div
          key={`fm${key++}`}
          className="rounded border border-dashed bg-muted/30 px-2 py-1.5 font-mono text-[0.7rem] text-muted-foreground/80 space-y-0.5"
        >
          {fm.map((l, j) => (
            <div key={j}>{l}</div>
          ))}
        </div>,
      )
      i = end + 1
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }

    // Fenced code block.
    if (trimmed.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push(
        <pre
          key={`code${key++}`}
          className="overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed text-foreground"
        >
          {buf.join('\n')}
        </pre>,
      )
      continue
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr${key++}`} className="border-border" />)
      i++
      continue
    }

    // Heading → bold (# becomes bold, not <h1>).
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (h) {
      const level = h[1].length
      blocks.push(
        <p
          key={`h${key++}`}
          className={cn('text-foreground', level <= 2 ? 'font-semibold' : 'font-medium')}
        >
          {renderInline(h[2], `h${key}`)}
        </p>,
      )
      i++
      continue
    }

    // Bullet list (consecutive items, indentation flattened).
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={`ul${key++}`} className="list-disc space-y-0.5 pl-4">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `li${key}-${j}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered list.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={`ol${key++}`} className="list-decimal space-y-0.5 pl-4">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `oli${key}-${j}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Paragraph.
    blocks.push(<p key={`p${key++}`}>{renderInline(trimmed, `p${key}`)}</p>)
    i++
  }

  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">{blocks}</div>
  )
}

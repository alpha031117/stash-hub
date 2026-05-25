import { useState, useEffect } from 'react'
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from 'date-fns'
import { Video, Calendar, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Meeting } from '@/hooks/useGoogleCalendar'

const PAGE_SIZE = 5

function dayLabel(dateStr: string): { label: string; today: boolean } {
  const d = parseISO(dateStr)
  if (isToday(d)) return { label: 'Today', today: true }
  if (isTomorrow(d)) return { label: 'Tomorrow', today: false }
  return { label: format(d, 'EEE, MMM d'), today: false }
}

function timeRange(starts: string, ends: string, isAllDay: boolean): string {
  if (isAllDay) return 'All day'
  const s = parseISO(starts)
  const e = parseISO(ends)
  const duration = differenceInMinutes(e, s)
  const hrs = Math.floor(duration / 60)
  const mins = duration % 60
  const dur = hrs > 0 ? `${hrs}h${mins ? ` ${mins}m` : ''}` : `${mins}m`
  return `${format(s, 'h:mm a')} · ${dur}`
}

function groupByDay(meetings: Meeting[]): { label: string; today: boolean; items: Meeting[] }[] {
  const map = new Map<string, { label: string; today: boolean; items: Meeting[] }>()
  for (const m of meetings) {
    const key = m.starts_at.slice(0, 10)
    if (!map.has(key)) {
      map.set(key, { ...dayLabel(m.starts_at), items: [] })
    }
    map.get(key)!.items.push(m)
  }
  return [...map.values()]
}

type Props = {
  meetings: Meeting[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

export function MeetingsWidget({ meetings, isLoading, error, onRefresh }: Props) {
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [meetings])

  const totalPages = Math.ceil(meetings.length / PAGE_SIZE)
  const paginated = meetings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const groups = groupByDay(paginated)

  return (
    <Card className="flex flex-col flex-1">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Calendar className="size-4 text-muted-foreground" />
          Upcoming meetings
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex flex-col flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <p className="text-xs text-destructive py-2">{error}</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No meetings in the next 30 days
          </p>
        ) : (
          <>
            <div className="space-y-4 flex-1">
              {groups.map((group) => (
                <div key={group.items[0].starts_at.slice(0, 10)}>
                  <p
                    className={cn(
                      'text-xs font-semibold mb-1.5',
                      group.today ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {group.label}
                  </p>
                  <ul className="space-y-1.5">
                    {group.items.map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {timeRange(m.starts_at, m.ends_at, m.is_all_day)}
                          </p>
                        </div>
                        {m.url && (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                            title="Join meeting"
                          >
                            <Video className="size-3.5 text-muted-foreground" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page === totalPages - 1}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

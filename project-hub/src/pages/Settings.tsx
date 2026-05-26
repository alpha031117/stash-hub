import { Bot, Calendar, Check, Loader2, Unlink, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/uiStore'
import { useCompanies } from '@/hooks/useCompanies'
import {
  useGoogleConnected,
  useGoogleConnect,
  useGoogleDisconnect,
} from '@/hooks/useGoogleCalendar'
import { inTauriApp, useCcStatus } from '@/hooks/useClaudeCode'

function GoogleCalendarCard() {
  const { data: connected = false, isLoading: checkingConnection } = useGoogleConnected()
  const { connect, isConnecting, error } = useGoogleConnect()
  const disconnect = useGoogleDisconnect()

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="size-4" />
          Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect this company's Google account to see upcoming meetings on the dashboard.
        </p>

        {checkingConnection ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : connected ? (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <Check className="size-4" />
              Connected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <Unlink className="size-3.5 mr-1.5" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={connect} disabled={isConnecting} size="sm">
              {isConnecting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Waiting for Google…
                </>
              ) : (
                'Connect Google Calendar'
              )}
            </Button>
            {(!import.meta.env.VITE_GOOGLE_CLIENT_ID || !import.meta.env.VITE_GOOGLE_CLIENT_SECRET) && (
              <p className="text-xs text-amber-600">
                Add <code className="bg-muted px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> and{' '}
                <code className="bg-muted px-1 rounded">VITE_GOOGLE_CLIENT_SECRET</code> to{' '}
                <code className="bg-muted px-1 rounded">.env.local</code>.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
        {disconnect.isError && (
          <p className="text-xs text-destructive">
            Disconnect failed: {disconnect.error instanceof Error ? disconnect.error.message : String(disconnect.error)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Claude Code is a machine-global integration (reads ~/.claude locally), so it
// renders regardless of the active company — unlike the Google card above.
function ClaudeCodeCard() {
  const { data: status, isLoading, isError, error } = useCcStatus()

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bot className="size-4" />
          Claude Code
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Reads your local Claude Code activity from{' '}
          <code className="bg-muted px-1 rounded">~/.claude</code>. View it on the Claude Code
          page.
        </p>

        {!inTauriApp ? (
          <p className="text-xs text-muted-foreground">
            Only available in the desktop app — the browser preview can't read local files.
          </p>
        ) : isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : isError ? (
          <p className="text-sm text-destructive">
            Couldn't check: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : status?.available ? (
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <Check className="size-4" />
              Connected
            </span>
            <p className="text-xs text-muted-foreground">
              {status.projectCount} project{status.projectCount === 1 ? '' : 's'} found ·{' '}
              {status.mavisInstalled ? 'Mavis brain detected' : 'no Mavis brain'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not detected — no <code className="bg-muted px-1 rounded">~/.claude</code> directory on
            this machine.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function Settings() {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const { data: companies = [] } = useCompanies()
  const activeCompany = companies.find((c) => c.id === activeCompanyId)

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      {!activeCompanyId ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
          <Building2 className="size-5 shrink-0" />
          Select a company from the sidebar to configure per-company integrations.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {activeCompany?.color && (
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ background: activeCompany.color }}
              />
            )}
            Configuring: <span className="font-medium text-foreground">{activeCompany?.name}</span>
          </div>

          <GoogleCalendarCard />
        </>
      )}

      <ClaudeCodeCard />
    </div>
  )
}

import { useDashboardData } from '@/hooks/useDashboardData'
import { useGoogleConnected, useGoogleMeetings } from '@/hooks/useGoogleCalendar'
import { KpiCards } from '@/components/dashboard/KpiCards'
import { ThroughputChart } from '@/components/dashboard/ThroughputChart'
import { WipChart } from '@/components/dashboard/WipChart'
import { TodoTasks } from '@/components/dashboard/TodoTasks'
import { MeetingsWidget } from '@/components/dashboard/MeetingsWidget'

export function Dashboard() {
  const { isLoading, kpi, throughputData, wipData, todoTasks, companies, activeCompanyId } =
    useDashboardData()

  const { data: googleConnected = false } = useGoogleConnected()
  const { data: meetings = [], isLoading: meetingsLoading, isError: meetingsError, error: meetingsErrorMsg, refetch: refetchMeetings } =
    useGoogleMeetings(googleConnected)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <KpiCards {...kpi} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <ThroughputChart
            data={throughputData}
            companies={companies}
            activeCompanyId={activeCompanyId}
          />
          {wipData.length > 0 && (
            <WipChart className="flex-1" data={wipData} byProject={!!activeCompanyId} />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <TodoTasks tasks={todoTasks} />
          {googleConnected && (
            <MeetingsWidget
              meetings={meetings}
              isLoading={meetingsLoading}
              error={meetingsError ? String(meetingsErrorMsg) : null}
              onRefresh={() => refetchMeetings()}
            />
          )}
        </div>
      </div>
    </div>
  )
}

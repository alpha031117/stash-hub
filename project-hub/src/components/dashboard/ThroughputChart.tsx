import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ThroughputEntry } from '@/hooks/useDashboardData'
import type { Company } from '@/hooks/useCompanies'

const FALLBACK_COLOR = '#6366f1'

type Props = {
  data: ThroughputEntry[]
  companies: Company[]
  activeCompanyId: string | null
}

export function ThroughputChart({ data, companies, activeCompanyId }: Props) {
  const hasAny = data.some((d) => {
    const { date: _date, ...rest } = d
    return Object.values(rest).some((v) => (v as number) > 0)
  })

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Throughput — last 30 days</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-2 pb-4">
        {!hasAny ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            No completed tasks in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barSize={6} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} cursor={false} />
              {activeCompanyId ? (
                <Bar dataKey="count" fill={FALLBACK_COLOR} radius={[2, 2, 0, 0]} />
              ) : (
                <>
                  {companies.map((c) => (
                    <Bar
                      key={c.id}
                      dataKey={c.name}
                      stackId="a"
                      fill={c.color ?? FALLBACK_COLOR}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                  {companies.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

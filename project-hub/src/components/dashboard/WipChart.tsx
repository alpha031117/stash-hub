import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { WipEntry } from '@/hooks/useDashboardData'

type Props = {
  data: WipEntry[]
  byProject: boolean
  className?: string
}

export function WipChart({ data, byProject, className }: Props) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          WIP by {byProject ? 'project' : 'company'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4 flex-1 flex items-center">
        {data.length === 0 ? (
          <div className="flex items-center justify-center w-full h-24 text-sm text-muted-foreground">
            No work in progress
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(80, data.length * 36)}>
            <BarChart
              layout="vertical"
              data={data}
              barSize={16}
              margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} cursor={false} />
              <Bar dataKey="wip" radius={[0, 3, 3, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

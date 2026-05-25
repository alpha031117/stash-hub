import type { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'

type Props = {
  children: ReactNode
}

export function AppLayout({ children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 flex flex-col">{children}</main>
    </div>
  )
}

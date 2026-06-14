import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Megaphone, NotebookPen, Bot, MessageSquare, Settings } from 'lucide-react'
import { CompanySwitcher } from '@/components/layout/CompanySwitcher'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/standup', icon: Megaphone, label: 'Stand-up' },
  { to: '/notes', icon: NotebookPen, label: 'Notes' },
  { to: '/claude-code', icon: Bot, label: 'Claude Code' },
  { to: '/chat', icon: MessageSquare, label: 'Mavis Chat' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="flex flex-col w-56 border-r bg-sidebar h-screen shrink-0">
      <div className="p-3 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
          Workspace
        </p>
        <CompanySwitcher />
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent',
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

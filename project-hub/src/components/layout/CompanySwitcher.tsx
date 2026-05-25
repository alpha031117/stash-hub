import { useState } from 'react'
import { ChevronsUpDown, Plus, Pencil, Trash2, Globe } from 'lucide-react'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useUiStore } from '@/stores/uiStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CompanyDialog } from '@/components/layout/CompanyDialog'
import { DeleteCompanyDialog } from '@/components/layout/DeleteCompanyDialog'
import { cn } from '@/lib/utils'

export function CompanySwitcher() {
  const { data: companies = [] } = useCompanies()
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const setActiveCompany = useUiStore((s) => s.setActiveCompany)
  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Company | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm font-medium',
            'hover:bg-sidebar-accent transition-colors outline-none',
          )}
        >
          <span className="flex items-center gap-2 truncate min-w-0">
            {activeCompany ? (
              <>
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ background: activeCompany.color }}
                />
                <span className="truncate">{activeCompany.name}</span>
              </>
            ) : (
              <>
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">All companies</span>
              </>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuItem
            onClick={() => setActiveCompany(null)}
            className={cn('flex items-center gap-2', !activeCompanyId && 'font-medium')}
          >
            <Globe className="size-3.5 text-muted-foreground" />
            All companies
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {companies.map((c) => (
            <DropdownMenuItem
              key={c.id}
              className="flex items-center justify-between gap-2 group"
              onClick={() => setActiveCompany(c.id)}
            >
              <span className="flex items-center gap-2 truncate">
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ background: c.color }}
                />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="hidden group-hover:flex gap-1">
                <button
                  className="p-0.5 rounded hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditTarget(c)
                  }}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-destructive/20 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(c)
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            </DropdownMenuItem>
          ))}

          {companies.length > 0 && <DropdownMenuSeparator />}

          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-2" /> New company
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CompanyDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        company={editTarget ?? undefined}
      />
      <DeleteCompanyDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        company={deleteTarget}
        onDeleted={() => {
          if (deleteTarget?.id === activeCompanyId) setActiveCompany(null)
        }}
      />
    </>
  )
}

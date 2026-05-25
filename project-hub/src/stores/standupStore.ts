import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TaskStatus } from '@/hooks/useTasks'
import { useUiStore } from '@/stores/uiStore'

export type LookbackMode = 'previous-day' | 'last-workday' | 'last-3-days' | 'last-7-days'

export const STANDUP_GLOBAL_SCOPE = '__global__'

export const DEFAULT_TEMPLATE = `{{date}} - {{dayShort}} - {{name}}

Previous Work Day - {{prevDayShort}}
{{yesterday}}

Issues Faced : {{blockers}}

Today:
{{today}}`

export type StandupConfig = {
  template: string
  lookback: LookbackMode
  todoStatuses: TaskStatus[]
  groupByProject: boolean
  name: string
}

export const DEFAULT_CONFIG: StandupConfig = {
  template: DEFAULT_TEMPLATE,
  lookback: 'last-workday',
  todoStatuses: ['todo', 'in_progress'],
  groupByProject: false,
  name: '',
}

type StandupState = {
  configByScope: Record<string, StandupConfig>
  setTemplate: (scope: string, t: string) => void
  setLookback: (scope: string, l: LookbackMode) => void
  toggleTodoStatus: (scope: string, s: TaskStatus) => void
  setGroupByProject: (scope: string, b: boolean) => void
  setName: (scope: string, n: string) => void
  resetTemplate: (scope: string) => void
}

function patch(
  state: StandupState,
  scope: string,
  fn: (cfg: StandupConfig) => StandupConfig,
): Record<string, StandupConfig> {
  const current = state.configByScope[scope] ?? DEFAULT_CONFIG
  return { ...state.configByScope, [scope]: fn(current) }
}

type LegacyState = Partial<StandupConfig> & {
  configByScope?: Record<string, StandupConfig>
}

export const useStandupStore = create<StandupState>()(
  persist(
    (set) => ({
      configByScope: {},
      setTemplate: (scope, template) =>
        set((s) => ({ configByScope: patch(s, scope, (c) => ({ ...c, template })) })),
      setLookback: (scope, lookback) =>
        set((s) => ({ configByScope: patch(s, scope, (c) => ({ ...c, lookback })) })),
      toggleTodoStatus: (scope, status) =>
        set((s) => ({
          configByScope: patch(s, scope, (c) => ({
            ...c,
            todoStatuses: c.todoStatuses.includes(status)
              ? c.todoStatuses.filter((x) => x !== status)
              : [...c.todoStatuses, status],
          })),
        })),
      setGroupByProject: (scope, groupByProject) =>
        set((s) => ({ configByScope: patch(s, scope, (c) => ({ ...c, groupByProject })) })),
      setName: (scope, name) =>
        set((s) => ({ configByScope: patch(s, scope, (c) => ({ ...c, name })) })),
      resetTemplate: (scope) =>
        set((s) => ({
          configByScope: patch(s, scope, (c) => ({ ...c, template: DEFAULT_TEMPLATE })),
        })),
    }),
    {
      name: 'stashhub-standup',
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') {
          return { configByScope: {} } as unknown as StandupState
        }
        if (version >= 2) return persisted as StandupState
        const legacy = persisted as LegacyState
        if (legacy.configByScope) return legacy as unknown as StandupState
        const migrated: StandupConfig = {
          template: legacy.template ?? DEFAULT_TEMPLATE,
          lookback: legacy.lookback ?? 'last-workday',
          todoStatuses: legacy.todoStatuses ?? ['todo', 'in_progress'],
          groupByProject: legacy.groupByProject ?? false,
          name: legacy.name ?? '',
        }
        return {
          configByScope: { [STANDUP_GLOBAL_SCOPE]: migrated },
        } as unknown as StandupState
      },
    },
  ),
)

export function useStandupScope(): string {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  return activeCompanyId ?? STANDUP_GLOBAL_SCOPE
}

export function useStandupConfig(scope: string): StandupConfig {
  return useStandupStore((s) => s.configByScope[scope] ?? DEFAULT_CONFIG)
}

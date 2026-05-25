import { useEffect } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export function useAppUpdater() {
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const update = await check()
        if (cancelled || !update) return
        const ok = window.confirm(
          `StashHub ${update.version} is available.\n\n${update.body ?? ''}\n\nInstall now? The app will restart.`,
        )
        if (!ok) return
        await update.downloadAndInstall()
        await relaunch()
      } catch (err) {
        console.error('[updater]', err)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])
}

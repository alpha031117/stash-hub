import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import { start, cancel, onUrl } from '@fabianlars/tauri-plugin-oauth'
import { useUiStore } from '@/stores/uiStore'

export type Meeting = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  url: string | null
  is_all_day: boolean
}

const connectedKey = (companyId: string) => ['google-connected', companyId]
const meetingsKey = (companyId: string) => ['google-meetings', companyId]

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(digest))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function useGoogleConnected() {
  const companyId = useUiStore((s) => s.activeCompanyId)

  return useQuery({
    queryKey: connectedKey(companyId ?? ''),
    enabled: !!companyId,
    queryFn: () => invoke<boolean>('google_is_connected', { companyId }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useGoogleMeetings(enabled: boolean) {
  const companyId = useUiStore((s) => s.activeCompanyId)

  return useQuery({
    queryKey: meetingsKey(companyId ?? ''),
    enabled: enabled && !!companyId,
    queryFn: () => invoke<Meeting[]>('google_fetch_meetings', { companyId }),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnMount: 'always',
  })
}

export function useGoogleConnect() {
  const qc = useQueryClient()
  const companyId = useUiStore((s) => s.activeCompanyId)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    if (!companyId) {
      setError('Select a company first')
      return
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined
    if (!clientId || !clientSecret) {
      setError('VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET must be set in .env.local')
      return
    }

    setIsConnecting(true)
    setError(null)
    let port: number | null = null

    try {
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)

      port = await start()
      const redirectUri = `http://localhost:${port}`

      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent',
        }).toString()

      const callbackUrl = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('OAuth timed out after 5 minutes')),
          5 * 60 * 1000,
        )
        onUrl((url: string) => {
          clearTimeout(timeout)
          resolve(url)
        })
          .then(() => open(authUrl))
          .catch((e) => {
            clearTimeout(timeout)
            reject(e)
          })
      })

      const url = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      const oauthError = url.searchParams.get('error')

      if (oauthError) throw new Error(`Google denied access: ${oauthError}`)
      if (!code) throw new Error('No authorization code received')

      await invoke('google_exchange_code', {
        companyId,
        clientId,
        clientSecret,
        code,
        codeVerifier: verifier,
        redirectUri,
      })

      qc.setQueryData(connectedKey(companyId), true)
      qc.invalidateQueries({ queryKey: meetingsKey(companyId) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (port !== null) await cancel(port).catch(() => {})
      setIsConnecting(false)
    }
  }, [companyId, qc])

  return { connect, isConnecting, error }
}

export function useGoogleDisconnect() {
  const qc = useQueryClient()
  const companyId = useUiStore((s) => s.activeCompanyId)

  return useMutation({
    mutationFn: () => invoke<void>('google_disconnect', { companyId }),
    onSuccess: () => {
      if (!companyId) return
      qc.setQueryData(connectedKey(companyId), false)
      qc.removeQueries({ queryKey: meetingsKey(companyId) })
    },
  })
}

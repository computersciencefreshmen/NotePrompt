import { NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { createCachedReadinessProbe } from '@/lib/readiness-cache.mjs'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }
const READINESS_CACHE_MS = 2_000

const getDatabaseReadiness = createCachedReadinessProbe({
  probe: () => db.checkReadiness(),
  ttlMs: READINESS_CACHE_MS,
  onError: error => {
    console.error(
      'Readiness check failed:',
      error instanceof Error ? error.name : 'UnknownError',
    )
  },
})

export async function GET() {
  const snapshot = await getDatabaseReadiness()

  return NextResponse.json({
    success: snapshot.ready,
    status: snapshot.ready ? 'ready' : 'not_ready',
    checks: { database: snapshot.ready ? 'up' : 'down' },
    version: process.env.APP_VERSION || 'unknown',
    timestamp: new Date(snapshot.checkedAt).toISOString(),
  }, {
    status: snapshot.ready ? 200 : 503,
    headers: noStoreHeaders,
  })
}

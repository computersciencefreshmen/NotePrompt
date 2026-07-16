import { NextResponse } from 'next/server'

const headers = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
}

// Public liveness deliberately avoids database, Redis, and provider calls.
// Deployment orchestration must use the private readiness endpoint instead.
export async function GET() {
  return NextResponse.json(
    { success: true, status: 'alive' },
    { status: 200, headers },
  )
}

// Backward-compatible alias. Keep the legacy URL, but use the same database
// readiness check as /api/health so it cannot report a false healthy state.
export { GET } from '@/app/api/health/route'

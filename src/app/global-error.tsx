'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#15171a',
          color: '#e5e7eb',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: '28rem', textAlign: 'center', padding: '1rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '3rem' }}>⚠️</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              应用出现了严重错误
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
              {error.message || '发生了意外错误'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                重试
              </button>
              <button
                onClick={() => window.location.href = '/prompts'}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  color: '#e5e7eb',
                  border: '1px solid #374151',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

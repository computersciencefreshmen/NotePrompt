import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'API服务器正常运行',
    timestamp: new Date().toISOString()
  })
} 
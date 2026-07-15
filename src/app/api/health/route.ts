import { NextResponse } from 'next/server'
import mysql from 'mysql2/promise'

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' }

async function checkDatabaseReadiness() {
  const host = process.env.MYSQL_HOST
  const user = process.env.MYSQL_USER
  const password = process.env.MYSQL_PASSWORD
  const database = process.env.MYSQL_DATABASE
  const port = Number.parseInt(process.env.MYSQL_PORT || '3306', 10)

  if (!host || !user || !password || !database || !Number.isInteger(port)) {
    throw new Error('Database readiness configuration is incomplete')
  }
  if (user.trim().toLowerCase() === 'root') {
    throw new Error('Database readiness refuses the root account')
  }

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    connectTimeout: 2500,
    charset: 'utf8mb4',
    multipleStatements: false,
  })

  try {
    await connection.query({ sql: 'SELECT 1', timeout: 1500 })
  } finally {
    connection.destroy()
  }
}

export async function GET() {
  try {
    await checkDatabaseReadiness()

    return NextResponse.json({
      success: true,
      status: 'ready',
      checks: { database: 'up' },
      version: process.env.APP_VERSION || 'unknown',
      timestamp: new Date().toISOString(),
    }, { status: 200, headers: noStoreHeaders })

  } catch (error) {
    console.error('Readiness check failed:', error instanceof Error ? error.name : 'UnknownError')

    return NextResponse.json({
      success: false,
      status: 'not_ready',
      checks: { database: 'down' },
      version: process.env.APP_VERSION || 'unknown',
      timestamp: new Date().toISOString(),
    }, { status: 503, headers: noStoreHeaders })
  }
}

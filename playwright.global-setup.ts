import { existsSync, unlinkSync } from 'fs'
import path from 'path'

export default async function () {
  const dbPath = path.join(process.cwd(), 'data', 'txls.db')
  if (existsSync(dbPath)) {
    console.log('Deleting test database:', dbPath)
    unlinkSync(dbPath)
    console.log('Test database deleted')
  }
}

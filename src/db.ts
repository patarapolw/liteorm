import 'bluebird-global'
import sqlite from 'sqlite'

import { Collection } from './collection'

export class Db {
  static async connect (f: string | sqlite.Database, options?: any) {
    const sql = typeof f === 'string' ? await sqlite.open(f, options) : f
    return new Db({ sql })
  }

  sql: sqlite.Database
  cols: Record<string, Collection<any>> = {}

  private constructor (params: any) {
    this.sql = params.sql
  }

  async close () {
    await this.sql.close()
    return this
  }
}

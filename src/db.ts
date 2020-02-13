import 'bluebird-global'
import sqlite from 'sqlite'
import { Collection } from './collection'

export class Db {
  public static async connect (f: string | sqlite.Database, options?: any) {
    const sql = typeof f === 'string' ? await sqlite.open(f, options) : f
    return new Db({ sql })
  }

  public sql: sqlite.Database;
  public cols: Record<string, Collection<any>> = {};

  private constructor (params: any) {
    this.sql = params.sql
  }

  public async collection<T> (model: T) {
    const col = new Collection(this.sql, model)
    await col.build()
    this.cols[col.name] = col
    return col
  }

  public async close () {
    await this.sql.close()
    return this
  }
}

import sqlite from 'sqlite'
import Emittery from 'emittery'
import { SQLStatement } from 'sql-template-strings'

import { ISqliteMeta, IPropRow, IPrimaryRow } from './decorators'
import { SqliteExt, AliasToSqliteType, isNullOrUndefined, safeColumnName } from './utils'
import { SQL, joinSQL } from './compat/sql-template-strings'

export type UndefinedEqNull<E> = {
  [K in keyof E]: E[K] | (undefined extends E[K] ? null : never)
}

export interface ITransformer<T> {
  get: (repr: any) => T | null
  set: (data: T) => any
}

export class Column<T = any> {
  constructor (
    public opts: {
      name: string
      table: Table<any>
      prop?: IPropRow<T> | IPrimaryRow<T>
    },
  ) {}

  get tableName () {
    return this.opts.table.m.__meta.name
  }

  get name () {
    return this.opts.name
  }
}

export class Table<
  M = any,
  AdditionalProps extends { ROWID?: number; createdAt?: Date; updatedAt?: Date } = {},
  E extends M & AdditionalProps = M & AdditionalProps
> extends Emittery.Typed<{
  'build-sql': SQLStatement
  'pre-create': {
    entry: UndefinedEqNull<E>
    options: {
      postfix: SQLStatement[]
    }
  }
  'create-sql': SQLStatement
  'pre-update': {
    sql: SQLStatement
    set: Partial<UndefinedEqNull<E>>
  }
  'update-sql': SQLStatement
  'pre-delete': {
    sql: SQLStatement
  }
  'delete-sql': SQLStatement
}> {
  c: Required<{
    [K in keyof E]: Column<E[K]>
  }>

  m: E & {
    __meta: ISqliteMeta<E>
  }

  get primaryKey () {
    return this.m.__meta.primary && typeof this.m.__meta.primary.name === 'string' ? this.m.__meta.primary.name : 'ROWID'
  }

  get name () {
    return this.m.__meta.name
  }

  constructor (M: { new(): M }) {
    super()
    this.m = new M() as any

    if (this.m.__meta.createdAt) {
      (this.m.__meta.prop as any).createdAt = { type: 'Date', null: false, default: () => new Date() }
    }

    if (this.m.__meta.updatedAt) {
      (this.m.__meta.prop as any).updatedAt = {
        type: 'Date',
        null: false,
        onChange: () => new Date(),
      }
    }

    this.c = Object.entries(this.m.__meta.prop).map(([k, v]) => {
      if (v) {
        return [k, new Column({
          name: k,
          table: this,
          prop: v as IPropRow<any>,
        })]
      }
      return null
    }).filter((el) => el)
      .reduce((prev, [k, v]: any) => ({ ...prev, [k]: v }), {}) as any

    (this.c as any)[this.primaryKey] = new Column({
      name: this.primaryKey,
      table: this,
      prop: this.m.__meta.primary,
    })

    Object.entries(this.m.__meta.prop).map(([k, v]) => {
      if (v) {
        const { default: def, onChange, onUpdate } = v

        if (typeof def === 'function' || onChange !== undefined) {
          const fn = def || onChange

          this.on('pre-create', async ({ entry }) => {
            if (isNullOrUndefined((entry as any)[k])) {
              (entry as any)[k] = typeof fn === 'function' ? await fn(entry) : fn
            }
          })
        }

        if (onUpdate !== undefined || onChange !== undefined) {
          const fn = onUpdate !== undefined ? onUpdate : onChange

          this.on('pre-update', async ({ set }) => {
            /**
             * NULL should be able to set SQLite row to BLANK
             */
            if ((set as any)[k] === undefined) {
              (set as any)[k] = typeof fn === 'function' ? await fn(set) : fn
            }
          })
        }
      }
    })
  }

  async __init (db: sqlite.Database) {
    const getDefault = (k: string, v: {
      default?: any
      type?: keyof typeof AliasToSqliteType
    }) => {
      if (isNullOrUndefined(v.default)) {
        return SQL()
      } else if (v.default instanceof SQLStatement) {
        return SQL`DEFAULT ${v.default}`
      } else if (typeof v.default === 'string') {
        return SQL(`DEFAULT '${v.default.replace(/'/, "[']")}'`)
      } else if (typeof v.default === 'number') {
        return SQL(`DEFAULT ${v.default}`)
      } else if (typeof v.default === 'boolean') {
        return SQL(`DEFAULT ${v.default ? 1 : 0}`)
      }

      return SQL()
    }

    const cols = [] as SQLStatement[]

    if (this.m.__meta.primary && this.m.__meta.primary.type) {
      cols.push(joinSQL([
        safeColumnName(this.m.__meta.primary.name as string),
        AliasToSqliteType[this.m.__meta.primary.type as keyof typeof AliasToSqliteType] || 'INTEGER',
        'PRIMARY KEY',
        ...(this.m.__meta.primary.autoincrement ? [
          'AUTOINCREMENT',
        ] : []),
        getDefault(this.m.__meta.primary.name as string, this.m.__meta.primary),
      ], ' '))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.type) {
        cols.push(joinSQL([
          safeColumnName(k),
          AliasToSqliteType[v.type as keyof typeof AliasToSqliteType] || 'TEXT',
          ...(v.null ? [] : [
            'NOT NULL',
          ]),
          getDefault(k, v),
          ...(v.references ? [
            `REFERENCES ${safeColumnName(v.references)}`,
          ] : []),
        ], ' '))
      }
    }

    if (this.m.__meta.primary && Array.isArray(this.m.__meta.primary.name)) {
      cols.push(SQL`PRIMARY KEY (${
        joinSQL(this.m.__meta.primary.name.map((k) => safeColumnName(k)), ',')
      })`)
    }

    if (this.m.__meta.unique && this.m.__meta.unique.length > 0) {
      this.m.__meta.unique.forEach((ss) => {
        cols.push(SQL`UNIQUE ${ss.name} (${
          joinSQL(ss.keys.map((k) => safeColumnName(k as string)), ',')
        })`)
      })
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.unique) {
        cols.push(SQL`CONSTRAINT ${
          SQL(safeColumnName(v.unique))
        } UNIQUE (${
          SQL(safeColumnName(k))
        })`)
      }
    }

    const sql = SQL`CREATE TABLE IF NOT EXISTS ${
      SQL(safeColumnName(this.m.__meta.name))
    } (${joinSQL(cols, ',')})`

    await this.emit('build-sql', sql)
    await db.run(sql)

    if (this.m.__meta.index) {
      await Promise.all(this.m.__meta.index.map(async (idx) => {
        const sql = SQL`CREATE INDEX IF NOT EXISTS ${
          SQL(safeColumnName(idx.name))
        } ON ${this.m.__meta.name} (${
          joinSQL(idx.keys.map((k) => SQL(safeColumnName(k as string))), ',')
        })`
        await this.emit('build-sql', sql)
        await db.run(sql)
      }))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.index) {
        const sql = SQL`CREATE INDEX IF NOT EXISTS ${
          SQL(safeColumnName(v.index))
        } ON ${
          SQL(safeColumnName(this.m.__meta.name))
        } (${
          SQL(safeColumnName(k))
        })`
        await this.emit('build-sql', sql)
        await db.run(sql)
      }
    }
  }

  create (db: sqlite.Database): (
    entry: UndefinedEqNull<E>,
    options?: {
      postfix?: SQLStatement
      ignoreErrors?: boolean
    },
  ) => Promise<number> {
    return async (entry, options = {}) => {
      const postfix = options.postfix ? [options.postfix] : []

      if (options.ignoreErrors) {
        postfix.push(SQL`ON CONFLICT DO NOTHING`)
      }

      await this.emit('pre-create', { entry, options: { postfix } })

      const keys: string[] = []
      const values: any[] = []

      for (const [k, v] of Object.entries(entry)) {
        if (typeof v !== 'undefined') {
          keys.push(k)
          values.push(this.transform(k, 'set')(v))
        }
      }

      const sql = SQL`INSERT INTO ${
        SQL(safeColumnName(this.m.__meta.name))
      } (${
        joinSQL(keys.map((k) => safeColumnName(k)), ',')
      }) VALUES (${joinSQL(values.map((v) => SQL`${v}`), ',')}) ${
        joinSQL(postfix, ' ')
      }`

      await this.emit('create-sql', sql)
      const r = await db.run(sql)

      return r.lastID
    }
  }

  __updateBySql (db: sqlite.Database) {
    return async (
      sql: SQLStatement,
      set: Partial<E>,
    ) => {
      await this.emit('pre-update', { sql, set })

      const setSql: SQLStatement[] = []

      for (const [k, v] of Object.entries<any>(set)) {
        if (typeof v !== 'undefined') {
          setSql.push(SQL`${SQL(safeColumnName(k))} = ${this.transform(k, 'set')(v)}`)
        }
      }

      const resultSql = SQL`UPDATE ${
        SQL(safeColumnName(this.name))
      } SET ${joinSQL(setSql, ',')} WHERE ${
        SQL(safeColumnName(this.primaryKey))
      } IN (${sql})`

      await this.emit('update-sql', resultSql)
      await db.run(resultSql)
    }
  }

  __deleteBySql (db: sqlite.Database) {
    return async (sql: SQLStatement): Promise<void> => {
      await this.emit('pre-delete', { sql })

      const resultSql = SQL`DELETE FROM ${
        SQL(safeColumnName(this.name))
      } WHERE ${
        SQL(safeColumnName(this.primaryKey))
      } IN (${sql})`

      await this.emit('delete-sql', resultSql)
      await db.run(resultSql)
    }
  }

  /**
   * @internal
   * @param k
   * @param method
   */
  transform (k: string, method: 'get' | 'set' = 'set') {
    let fn: ((a: any) => any) | null = null

    const prop = (this.m.__meta.prop as any)[k] as IPropRow<any>
    if (prop) {
      if (prop.transform) {
        fn = prop.transform[method] || null
      }

      if (!fn) {
        const t = (_transformers as any)[prop.type] as ITransformer<any>
        if (t) {
          fn = t[method] || null
        }
      }
    }

    return fn || ((a: any) => a)
  }
}

export const _transformers: Record<SqliteExt, ITransformer<any>> = {
  Date: {
    get: (repr) => typeof repr === 'number' ? new Date(repr) : null,
    set: (d) => d ? d instanceof Date ? +d : +new Date(d) : null,
  },
  JSON: {
    get: (repr) => repr ? JSON.parse(repr) : null,
    set: (data) => data ? JSON.stringify(data) : null,
  },
  StringArray: {
    get: (repr?: string) => (() => {
      repr = repr ? repr.substr(1, repr.length - 2) : ''
      return repr ? repr.split('\x1f') : null
    })(),
    set: (d) => d ? '\x1f' + d.join('\x1f') + '\x1f' : null,
  },
  Boolean: {
    get: (repr) => typeof repr === 'number' ? repr !== 0 : null,
    set: (d) => typeof d === 'boolean' ? Number(d) : null,
  },
}

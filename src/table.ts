import Emittery from 'emittery'
import sqlite3 from 'sqlite3'

import { IPrimaryRow, IPropRow, ISqliteMeta } from './decorators'
import { AliasToSqliteType, RawSQL, SQLParams, SqliteExt, isNullOrUndefined, safeColumnName } from './utils'

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
  'build-sql': {
    stmt: string
  }
  'pre-create': {
    entry: UndefinedEqNull<E>
    options: {
      postfix: string[]
    }
  }
  'create-sql': {
    stmt: string
    params: SQLParams
  }
  'pre-update': {
    stmt: string
    params: SQLParams
    set: Partial<UndefinedEqNull<E>>
  }
  'update-sql': {
    stmt: string
    params: SQLParams
  }
  'pre-delete': {
    stmt: string
    params: SQLParams
  }
  'delete-sql': {
    stmt: string
    params: SQLParams
  }
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

  async __init (db: sqlite3.Database) {
    const getDefault = (k: string, v: {
      default?: any
      type?: keyof typeof AliasToSqliteType
    }) => {
      if (isNullOrUndefined(v.default)) {
        return ''
      } else if (v.default instanceof RawSQL) {
        return `DEFAULT ${v.default.content}`
      } else if (typeof v.default === 'string') {
        return `DEFAULT '${v.default.replace(/'/, "[']")}'`
      } else if (typeof v.default === 'number') {
        return `DEFAULT ${v.default}`
      } else if (typeof v.default === 'boolean') {
        return `DEFAULT ${v.default ? 1 : 0}`
      }

      return ''
    }

    const cols = [] as string[]

    if (this.m.__meta.primary && this.m.__meta.primary.type) {
      cols.push([
        safeColumnName(this.m.__meta.primary.name as string),
        AliasToSqliteType[this.m.__meta.primary.type as keyof typeof AliasToSqliteType] || 'INTEGER',
        'PRIMARY KEY',
        ...(this.m.__meta.primary.autoincrement ? [
          'AUTOINCREMENT',
        ] : []),
        getDefault(this.m.__meta.primary.name as string, this.m.__meta.primary),
      ].join(' '))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.type) {
        cols.push([
          safeColumnName(k),
          AliasToSqliteType[v.type as keyof typeof AliasToSqliteType] || 'TEXT',
          ...(v.null ? [] : [
            'NOT NULL',
          ]),
          ...(v.collate ? [
            `COLLATE ${v.collate}`
          ] : []),
          getDefault(k, v),
          ...(v.references ? [
            `REFERENCES ${safeColumnName(v.references)}`,
          ] : []),
        ].join(' '))
      }
    }

    if (this.m.__meta.primary && Array.isArray(this.m.__meta.primary.name)) {
      cols.push(`PRIMARY KEY (${
        this.m.__meta.primary.name.map((k) => safeColumnName(k)).join(',')
      })`)
    }

    if (this.m.__meta.unique && this.m.__meta.unique.length > 0) {
      this.m.__meta.unique.forEach((ss) => {
        cols.push(`CONSTRAINT ${safeColumnName(ss.name)} UNIQUE (${
          ss.keys.map((k) => safeColumnName(k as string)).join(',')
        })`)
      })
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.unique) {
        cols.push(`CONSTRAINT ${
          safeColumnName(v.unique)
        } UNIQUE (${
          safeColumnName(k)
        })`)
      }
    }

    const stmt = `CREATE TABLE IF NOT EXISTS ${
      safeColumnName(this.m.__meta.name)
    } (${cols.join(',')}) ${this.m.__meta.withoutRowID ? 'WITHOUT ROWID' : ''}`

    await this.emit('build-sql', { stmt })
    await new Promise((resolve, reject) => {
      db.run(stmt, (err) => err ? reject(err) : resolve())
    })

    if (this.m.__meta.index) {
      await Promise.all(this.m.__meta.index.map(async (idx) => {
        const stmt = `CREATE INDEX IF NOT EXISTS ${
          safeColumnName(idx.name)
        } ON ${this.m.__meta.name} (${
          idx.keys.map((k) => safeColumnName(k as string)).join(',')
        })`
        await this.emit('build-sql', { stmt })
        await new Promise((resolve, reject) => {
          db.run(stmt, (err) => err ? reject(err) : resolve())
        })
      }))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.index) {
        const stmt = `CREATE INDEX IF NOT EXISTS ${
          safeColumnName(v.index)
        } ON ${
          safeColumnName(this.m.__meta.name)
        } (${
          safeColumnName(k)
        })`
        await this.emit('build-sql', { stmt })
        await new Promise((resolve, reject) => {
          db.run(stmt, (err) => err ? reject(err) : resolve())
        })
      }
    }
  }

  create (db: sqlite3.Database): (
    entry: UndefinedEqNull<E>,
    options?: {
      postfix?: string
      ignoreErrors?: boolean
    },
  ) => Promise<number> {
    return async (entry, options = {}) => {
      const postfix = options.postfix ? [options.postfix] : []
      const params = new SQLParams()

      if (options.ignoreErrors) {
        postfix.push(`ON CONFLICT DO NOTHING`)
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

      const stmt = `INSERT INTO ${
        safeColumnName(this.m.__meta.name)
      } (${
        keys.map((k) => safeColumnName(k)).join(',')
      }) VALUES (${values.map((v) => params.add(v))}) ${
        postfix.join(' ')
      }`

      await this.emit('create-sql', { stmt, params })
      return new Promise<number>((resolve, reject) => {
        db.run(stmt, params.data, function (err) { err ? reject(err) : resolve(this.lastID) })
      })
    }
  }

  __updateBySql (db: sqlite3.Database) {
    return async (
      stmt: string,
      params: SQLParams,
      set: Partial<E>,
    ) => {
      await this.emit('pre-update', { stmt, params, set })

      const setSql: string[] = []

      for (const [k, v] of Object.entries<any>(set)) {
        if (typeof v !== 'undefined') {
          setSql.push(`${safeColumnName(k)} = ${params.add(this.transform(k, 'set')(v))}`)
        }
      }

      const resultSql = `UPDATE ${
        safeColumnName(this.name)
      } SET ${setSql.join(',')} WHERE ${
        safeColumnName(this.primaryKey)
      } IN (${stmt})`

      await this.emit('update-sql', { stmt: resultSql, params })
      await new Promise((resolve, reject) => {
        db.run(resultSql, params.data, function (err) { err ? reject(err) : resolve() })
      })
    }
  }

  __deleteBySql (db: sqlite3.Database) {
    return async (
      stmt: string,
      params: SQLParams,
    ): Promise<void> => {
      await this.emit('pre-delete', { stmt, params })

      const resultSql = `DELETE FROM ${
        safeColumnName(this.name)
      } WHERE ${
        safeColumnName(this.primaryKey)
      } IN (${stmt})`

      await this.emit('delete-sql', { stmt: resultSql, params })
      await new Promise((resolve, reject) => {
        db.run(resultSql, params.data, function (err) { err ? reject(err) : resolve() })
      })
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

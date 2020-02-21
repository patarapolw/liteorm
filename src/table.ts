import sqlite from 'sqlite'
import Emittery from 'emittery'

import { ISqliteMeta, IPropRow, IPrimaryRow } from './decorators'
import { SqliteExt, AliasToSqliteType, safeColumnName, SafeIds } from './utils'

export interface ISql {
  $statement: string
  $params: Record<string, any>
}

export interface ITransformer<T> {
  get: (repr: any) => T | null
  set: (data: T) => any
}

export class Column<T = any, E = any> {
  constructor (
    public opts: {
      name: string
      table: Table<E>
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

export class Table<E = any> extends Emittery.Typed<{
  'build-sql': ISql
  'pre-create': {
    entry: E
    options: {
      postfix: string[]
    }
  }
  'create-sql': ISql
  'pre-update': {
    sql: ISql
    set: Partial<E>
  }
  'update-sql': ISql
  'pre-delete': {
    sql: ISql
  }
  'delete-sql': ISql
}> {
  c: Required<{
    [K in keyof E]: Column<E[K], E>
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

  constructor (M: { new(): E }) {
    super()
    this.m = new M() as any

    if (this.m.__meta.createdAt) {
      (this.m.__meta.prop as any).createdAt = { type: 'Date', null: false, default: () => new Date() }
    }

    if (this.m.__meta.updatedAt) {
      (this.m.__meta.prop as any).updatedAt = {
        type: 'Date',
        null: false,
        default: () => new Date(),
        onUpdate: () => new Date(),
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
        const { onUpdate } = v as any

        if (onUpdate) {
          this.on('pre-update', async ({ set }) => {
            (set as any)[k] = (set as any)[k] || (typeof onUpdate === 'function' ? await onUpdate(set) : v)
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
      const def = !['undefined', 'function'].includes(typeof v.default) ? this.transform(k, 'set')(v.default) : v.default

      if (typeof def === 'undefined') {
        return ''
      } else if (typeof def === 'string') {
        return `DEFAULT '${def.replace(/'/g, "[']")}'`
      } else if (typeof def === 'number') {
        return `DEFAULT ${def}`
      } else if (typeof def === 'boolean') {
        return `DEFAULT ${def ? 1 : 0}`
      } else if (typeof v.default === 'function') {
        this.on('pre-create', async ({ entry }) => {
          (entry as any)[k] = (entry as any)[k] || await v.default!(entry)
        })
        return ''
      }

      return ''
    }

    const col: string[] = []

    if (this.m.__meta.primary && this.m.__meta.primary.type) {
      col.push([
        safeColumnName(this.m.__meta.primary.name as string),
        AliasToSqliteType[this.m.__meta.primary.type as keyof typeof AliasToSqliteType] || 'INTEGER',
        'PRIMARY KEY',
        this.m.__meta.primary.autoincrement ? 'AUTOINCREMENT' : '',
        getDefault(this.m.__meta.primary.name as string, this.m.__meta.primary),
      ].join(' '))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.type) {
        col.push([
          safeColumnName(k),
          AliasToSqliteType[v.type as keyof typeof AliasToSqliteType] || 'TEXT',
          v.null ? '' : 'NOT NULL',
          getDefault(k, v),
          v.references ? `REFERENCES ${safeColumnName(v.references)}` : '',
        ].join(' '))
      }
    }

    if (this.m.__meta.primary && Array.isArray(this.m.__meta.primary.name)) {
      col.push([
        'PRIMARY KEY',
        `(${this.m.__meta.primary.name.map((k) => safeColumnName(k as string)).join(',')})`,
      ].join(' '))
    }

    if (this.m.__meta.unique && this.m.__meta.unique.length > 0) {
      this.m.__meta.unique.forEach((ss) => {
        col.push([
          'UNIQUE',
          ss.name,
          `(${ss.keys.map((k) => safeColumnName(k as string)).join(',')})`,
        ].join(' '))
      })
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.unique) {
        col.push([
          'CONSTRAINT',
          v.unique,
          'UNIQUE',
          `(${safeColumnName(k)})`,
        ].join(' '))
      }
    }

    const sql: ISql = {
      $statement: [
        'CREATE TABLE IF NOT EXISTS',
        safeColumnName(this.m.__meta.name),
        `(${col.join(',')})`,
      ].join(' '),
      $params: [],
    }

    await this.emit('build-sql', sql)
    await db.exec(sql.$statement)

    if (this.m.__meta.index) {
      await Promise.all(this.m.__meta.index.map(async (idx) => {
        const sql: ISql = {
          $statement: [
            'CREATE INDEX IF NOT EXISTS',
            idx.name,
            'ON',
            `${safeColumnName(this.m.__meta.name)}`,
            `(${idx.keys.map((k) => safeColumnName(String(k))).join(',')})`,
          ].join(' '),
          $params: [],
        }

        await this.emit('build-sql', sql)
        await db.exec(sql.$statement)
      }))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.m.__meta.prop as any)) {
      if (v && v.index) {
        const sql: ISql = {
          $statement: [
            'CREATE INDEX IF NOT EXISTS',
            v.index,
            'ON',
            `${safeColumnName(this.m.__meta.name)}`,
            `(${safeColumnName(k)})`,
          ].join(' '),
          $params: [],
        }

        await this.emit('build-sql', sql)
        await db.exec(sql.$statement)
      }
    }
  }

  create (db: sqlite.Database): (
    entry: E,
    options?: {
      postfix?: string
      ignoreErrors?: boolean
    },
  ) => Promise<number> {
    const bindings = new SafeIds()

    return async (entry, options = {}) => {
      const postfix = options.postfix ? [options.postfix] : []

      if (options.ignoreErrors) {
        postfix.push('ON CONFLICT DO NOTHING')
      }

      await this.emit('pre-create', { entry, options: { postfix } })

      const bracketed: string[] = []
      const values: Record<string, any> = {}

      for (let [k, v] of Object.entries(entry)) {
        if (typeof v !== 'undefined') {
          v = this.transform(k, 'set')(v)
          bracketed.push(k)
          Object.assign(values, { [bindings.pop()]: v })
        }
      }

      const sql = {
        $statement: [
          `INSERT INTO ${safeColumnName(this.m.__meta.name)}`,
          `(${bracketed.map(safeColumnName).join(',')})`,
          `VALUES (${Object.keys(values).join(',')})`,
          ...postfix,
        ].join(' '),
        $params: values,
      }

      await this.emit('create-sql', sql)
      const r = await db.run(sql.$statement, sql.$params)

      return r.lastID
    }
  }

  __updateBySql (db: sqlite.Database) {
    return async (
      sql: ISql,
      set: Partial<E>,
      bindings: SafeIds,
    ) => {
      await this.emit('pre-update', { sql, set })

      const setK: string[] = []
      const setV: Record<string, any> = {}

      for (let [k, v] of Object.entries<any>(set)) {
        if (typeof v !== 'undefined') {
          v = this.transform(k, 'set')(v)
          const id = bindings.pop()
          setK.push(`${k} = ${id}`)
          setV[id] = v
        }
      }

      sql = {
        $statement: [
          `UPDATE ${safeColumnName(this.name)}`,
          `SET ${setK.map(safeColumnName).join(',')}`,
          `WHERE ${safeColumnName(this.primaryKey)}`,
          'IN',
          `(${sql.$statement})`,
        ].join(' '),
        $params: {
          ...setV,
          ...sql.$params,
        },
      }

      await this.emit('update-sql', sql)
      await db.run(sql.$statement, sql.$params)
    }
  }

  __deleteBySql (db: sqlite.Database) {
    return async (sql: ISql): Promise<void> => {
      await this.emit('pre-delete', { sql })

      sql = {
        $statement: [
          `DELETE FROM ${safeColumnName(this.name)}`,
          `WHERE ${safeColumnName(this.primaryKey)}`,
          'IN',
          `(${sql.$statement})`,
        ].join(' '),
        $params: sql.$params,
      }

      await this.emit('delete-sql', sql)
      await db.run(sql.$statement, sql.$params)
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

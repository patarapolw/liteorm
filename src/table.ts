import sqlite from 'sqlite'
import Emittery from 'emittery'

import { ISqliteMeta, IPropRow } from './decorators'
import { SqliteExt, AliasToSqliteType, safeColumnName, safeId } from './utils'
import { parseCond } from './find'

export interface ISql {
  $statement: string
  $params: Record<string, any>
}

interface ITransformer<T> {
  get: (repr: any) => T | null
  set: (data: T) => any
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
    id: any
    set: Partial<E>
  }
  'update-sql': ISql
  'pre-delete': {
    id: any
  }
  'delete-sql': ISql
}> {
  __meta: ISqliteMeta<E>

  get __primaryKey () {
    return this.__meta.primary && typeof this.__meta.primary.name === 'string' ? this.__meta.primary.name : 'ROWID'
  }

  constructor (M: { new(): E }) {
    super()
    this.__meta = (new M() as any).__meta as ISqliteMeta<E>

    /**
     * __meta is being injected by `@Table`
     */
    this.__meta.prop = {
      createdAt: this.__meta.createdAt ? { type: 'Date', null: false, default: () => new Date() } : undefined,
      updatedAt: this.__meta.updatedAt ? {
        type: 'Date',
        null: false,
        default: () => new Date(),
        onUpdate: () => new Date(),
      } : undefined,
      ...this.__meta.prop,
    }

    Object.entries(this.__meta.prop).map(([k, v]) => {
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
      if (typeof v.default === 'undefined') {
        return ''
      } else if (typeof v.default === 'string') {
        return `DEFAULT '${v.default.replace(/'/g, "[']")}'`
      } else if (typeof v.default === 'number') {
        return `DEFAULT ${v.default}`
      } else if (typeof v.default === 'boolean') {
        return `DEFAULT ${v.default ? 1 : 0}`
      } else if (typeof v.default === 'function') {
        this.on('pre-create', async ({ entry }) => {
          (entry as any)[k] = (entry as any)[k] || await v.default!(entry)
        })
        return ''
      } else if (v.type && (transformers as any)[v.type]) {
        return `DEFAULT ${(transformers as any)[v.type].set(v.default)}`
      }

      return ''
    }

    const col: string[] = []

    if (this.__meta.primary && this.__meta.primary.type) {
      col.push([
        safeColumnName(this.__meta.primary.name as string),
        AliasToSqliteType[this.__meta.primary.type as keyof typeof AliasToSqliteType] || 'INTEGER',
        'PRIMARY KEY',
        this.__meta.primary.autoincrement ? 'AUTOINCREMENT' : '',
        getDefault(this.__meta.primary.name as string, this.__meta.primary),
      ].join(' '))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.__meta.prop as any)) {
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

    if (this.__meta.primary && Array.isArray(this.__meta.primary.name)) {
      col.push([
        'PRIMARY KEY',
        `(${this.__meta.primary.name.map((k) => safeColumnName(k as string)).join(',')})`,
      ].join(' '))
    }

    if (this.__meta.unique && this.__meta.unique.length > 0) {
      this.__meta.unique.forEach((ss) => {
        col.push([
          'UNIQUE',
          ss.name,
          `(${ss.keys.map((k) => safeColumnName(k as string)).join(',')})`,
        ].join(' '))
      })
    }

    for (const [k, v] of Object.entries<IPropRow>(this.__meta.prop as any)) {
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
        safeColumnName(this.__meta.name),
        `(${col.join(',')})`,
      ].join(' '),
      $params: [],
    }

    await this.emit('build-sql', sql)
    await db.exec(sql.$statement)

    if (this.__meta.index) {
      await Promise.all(this.__meta.index.map(async (idx) => {
        const sql: ISql = {
          $statement: [
            'CREATE INDEX IF NOT EXISTS',
            idx.name,
            'ON',
            `${safeColumnName(this.__meta.name)}`,
            `(${idx.keys.map((k) => safeColumnName(String(k))).join(',')})`,
          ].join(' '),
          $params: [],
        }

        await this.emit('build-sql', sql)
        await db.exec(sql.$statement)
      }))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.__meta.prop as any)) {
      if (v && v.index) {
        const sql: ISql = {
          $statement: [
            'CREATE INDEX IF NOT EXISTS',
            v.index,
            'ON',
            `${safeColumnName(this.__meta.name)}`,
            `(${safeColumnName(k)})`,
          ].join(' '),
          $params: [],
        }

        await this.emit('build-sql', sql)
        await db.exec(sql.$statement)
      }
    }
  }

  __create (db: sqlite.Database): (
    entry: E,
    options?: {
      postfix?: string
      ignoreErrors?: boolean
    },
  ) => Promise<number> {
    return async (entry, options = {}) => {
      const postfix = options.postfix ? [options.postfix] : []

      if (options.ignoreErrors) {
        postfix.push('ON CONFLICT DO NOTHING')
      }

      await this.emit('pre-create', { entry, options: { postfix } })

      const bracketed: string[] = []
      const values: Record<string, any> = {}

      for (let [k, v] of Object.entries(entry)) {
        const prop = (this.__meta.prop as any)[k]
        if (prop && prop.type) {
          const tr = (transformers as any)[prop.type]
          if (tr) {
            v = tr.set(v)
          }
        }

        bracketed.push(k)
        Object.assign(values, { [`$${safeId()}`]: v })
      }

      const sql = {
        $statement: [
          `INSERT INTO ${safeColumnName(this.__meta.name)}`,
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

  __updateById (db: sqlite.Database): (
    id: any,
    set: Partial<E>
  ) => Promise<void> {
    return async (id, set) => {
      await this.emit('pre-update', { id, set })

      const setK: string[] = []
      const setV: Record<string, any> = {}
      const where = parseCond({
        [this.__primaryKey]: id,
      }, {
        [this.__meta.name]: this,
      })

      for (let [k, v] of Object.entries<any>(set)) {
        const prop = (this.__meta.prop as any)[k]
        if (prop) {
          const { type } = prop
          const tr = type ? (transformers as any)[type] : undefined
          if (tr) {
            v = tr.set(v)
          }

          const id = `$${safeId()}`

          setK.push(`${k} = ${id}`)
          setV[id] = v
        }
      }

      const sql: ISql = {
        $statement: [
        `UPDATE ${safeColumnName(this.__meta.name)}`,
        `SET ${setK.map(safeColumnName).join(',')}`,
        `WHERE ${where.$statement}`,
        ].join(' '),
        $params: {
          ...setV,
          ...where.$params,
        },
      }

      await this.emit('update-sql', sql)
      await db.run(sql.$statement, sql.$params)
    }
  }

  __deleteById (db: sqlite.Database): (
    id: any
  ) => Promise<void> {
    return async (id) => {
      await this.emit('pre-delete', { id })

      const where = parseCond({
        [this.__primaryKey]: id,
      }, {
        [this.__meta.name]: this,
      })

      const sql: ISql = {
        $statement: [
        `DELETE FROM ${safeColumnName(this.__meta.name)}`,
        `WHERE ${where.$statement}`,
        ].join(' '),
        $params: where.$params,
      }

      await this.emit('delete-sql', sql)
      await db.run(sql.$statement, sql.$params)
    }
  }
}

export const transformers: Record<SqliteExt, ITransformer<any>> = {
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

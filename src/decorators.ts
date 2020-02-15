import 'reflect-metadata'
import { Collection } from './collection'

/**
 * https://www.sqlite.org/datatype3.html
 */
export type SqliteIndexable = 'TEXT' | 'INTEGER' | 'REAL'
export type SqliteNative = SqliteIndexable | 'BLOB'
export type SqliteExt = 'Boolean' | 'Date' | 'JSON' | 'StrArray'
export type SqliteAllTypes = SqliteNative | SqliteExt

export interface SqliteTypeToJS extends Record<SqliteAllTypes, any> {
  TEXT: string
  INTEGER: number
  FLOAT: number
  BLOB: ArrayBuffer
  Boolean: boolean
  Date: Date
  JSON: Record<string, any> | any[]
  StrArray: string[]
}

export const ClassNameToSqlite: Record<string, SqliteAllTypes> = {
  String: 'TEXT',
  Number: 'INTEGER',
  Date: 'Date',
  ArrayBuffer: 'BLOB',
}

/**
 * http://blog.wolksoftware.com/decorators-metadata-reflection-in-typescript-from-novice-to-expert-part-4
 */
export interface ClassNameToType {
  Number: number
  String: string
  Boolean: boolean
  Array: Array<any>
}

export function primary<T = any, E = any> (params: {
  name?: string
  type?: SqliteIndexable
  autoincrement?: boolean
  default?: T | ((entry: E) => T | Promise<T>)
  onUpdate?: T | ((entry: E) => T | Promise<T>)
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    let type: SqliteIndexable = params.type || (ClassNameToSqlite[t.name] as SqliteIndexable) || 'INTEGER'
    const name = params.name || key as string || '_id'
    const autoincrement = !!params.autoincrement && ['INTEGER', 'REAL'].includes(type)
    if (autoincrement) {
      type = 'INTEGER'
    }

    const primary: IPrimaryRow<T, E> = {
      name,
      type,
      autoincrement,
      default: autoincrement ? undefined : params.default,
      onUpdate: params.onUpdate,
    }

    Reflect.defineMetadata('sqlite:primary', primary, target)
  }
}

export function prop<T = any, E = any> (params: {
  name?: string
  type?: SqliteNative | SqliteExt
  index?: boolean
  unique?: boolean
  null?: boolean
  references?: string | Collection<any> | { col: Collection<any>; key: string }
  default?: T | ((entry: E) => T | Promise<T>)
  onUpdate?: T | ((entry: E) => T | Promise<T>)
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    const type = params.type || (ClassNameToSqlite[t.name] || 'JSON')
    const name = params.name || key as string

    const prop = Reflect.getMetadata('sqlite:prop', target) || {}

    prop[name] = {
      type,
      unique: params.unique ? params.unique : false,
      null: params.null ? params.null : false,
      index: params.index ? params.index : false,
      references: typeof params.references === 'string'
        ? params.references
        : params.references instanceof Collection
          ? `${params.references.name}(${String(params.references.__meta.primary.name)})`
          : typeof params.references === 'object'
            ? `${params.references.col.name}(${params.references.key})`
            : undefined,
      default: params.default ? params.default : undefined,
      onUpdate: params.onUpdate,
    } as IPropRow<T, E>

    Reflect.defineMetadata('sqlite:prop', prop, target)
  }
}

export function Table<T> (params: {
  name?: string
  primary?: Array<keyof T>
  unique?: Array<keyof T>[]
  timestamp?: boolean | {
    createdAt?: boolean
    updatedAt?: boolean
  }
} = {}): ClassDecorator {
  return function (target) {
    let timestamp = {
      createdAt: false,
      updatedAt: false,
    }

    if (params.timestamp) {
      if (params.timestamp === true) {
        timestamp = {
          createdAt: true,
          updatedAt: true,
        }
      } else {
        Object.assign(timestamp, JSON.parse(JSON.stringify(params.timestamp)))
      }
    }

    const { createdAt, updatedAt } = timestamp

    const name = params.name || target.constructor.name
    const primary = Reflect.getMetadata('sqlite:primary', target.prototype) || (params.primary ? { name: params.primary } : {
      name: '_id',
      type: 'integer',
      autoincrement: true,
    })
    const prop = Reflect.getMetadata('sqlite:prop', target.prototype)
    const unique = params.unique

    const __meta: ISqliteMeta<T> = { name, primary, prop, unique, createdAt, updatedAt }
    target.prototype.__meta = __meta
  }
}

export interface IPrimaryRow<T = any, E = any> {
  name: string | string[]
  type?: SqliteIndexable
  autoincrement: boolean
  default?: T | ((entry: E) => T | Promise<T>)
  onUpdate?: T | ((entry: E) => T | Promise<T>)
}

export interface IPropRow<T = any, E = any> {
  type: SqliteNative | SqliteExt
  unique: boolean
  null: boolean
  index: boolean
  references?: string
  default?: T | ((entry: E) => T | Promise<T>)
  onUpdate?: T | ((entry: E) => T | Promise<T>)
}

export interface ISqliteMeta<T> {
  name: string
  primary: IPrimaryRow
  prop: Partial<Record<keyof T, IPropRow>>
  unique?: (keyof T)[][]
  createdAt: boolean
  updatedAt: boolean
}

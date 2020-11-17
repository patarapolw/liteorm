import 'reflect-metadata'

import { ITransformer, Table } from './table'
import { AliasToJSType, AliasToSqliteType, RawSQL, SqliteAllTypes, normalizeAlias } from './utils'

export function primary<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends keyof typeof AliasToSqliteType = any
> (params: {
  name?: string
  type?: TSql
  autoincrement?: boolean
  default?: RawSQL | T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
  onChange?: T | ((entry: Entry) => T | Promise<T>)
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    let type: keyof typeof AliasToSqliteType = params.type || t.name
    type = normalizeAlias(type)

    const name = params.name || key as string
    const autoincrement = !!params.autoincrement
    if (autoincrement) {
      type = 'int'
    }

    const primary: IPrimaryRow<T, Entry> = {
      name,
      type: type as any,
      autoincrement,
      default: autoincrement ? undefined : params.default,
      onUpdate: params.onUpdate,
      onChange: params.onChange,
    }

    Reflect.defineMetadata('sqlite:primary', primary, target)
  }
}

export function prop<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends keyof typeof AliasToSqliteType = any
> (params: {
  name?: string
  type?: TSql
  index?: string | boolean
  unique?: string | boolean
  collate?: string | boolean
  null?: boolean
  references?: string | Table<any> | { table: Table<any>; key: string }
  default?: RawSQL | T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
  onChange?: T | ((entry: Entry) => T | Promise<T>)
  transform?: Partial<ITransformer<T>>
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    const name = params.name || key as string
    const references = typeof params.references === 'string'
      ? params.references
      : params.references instanceof Table
        ? `${params.references.m.__meta.name}(${
          params.references.m.__meta.primary
            ? String(params.references.m.__meta.primary.name)
            : 'ROWID'
        })`
        : typeof params.references === 'object'
          ? `${params.references.table.m.__meta.name}(${params.references.key})`
          : undefined
    let type = (typeof params.references === 'object'
      ? params.references instanceof Table
        ? (params.references.m.__meta.primary || {}).type
        : (params.references.table.m.__meta.prop[params.references.key] || {}).type
      : params.type || t.name) || 'INTEGER'

    type = normalizeAlias(type)

    const prop = Reflect.getMetadata('sqlite:prop', target) || {}

    prop[name] = {
      type,
      unique: typeof params.unique === 'string'
        ? params.unique
        : params.unique ? name + '_unique_idx' : undefined,
      collate: params.collate,
      null: params.null ? params.null : false,
      index: typeof params.index === 'string'
        ? params.index
        : params.index ? name + '_idx' : undefined,
      references,
      default: params.default ? params.default : undefined,
      onUpdate: params.onUpdate,
      onChange: params.onChange,
      transform: params.transform,
    } as IPropRow<T, Entry>

    Reflect.defineMetadata('sqlite:prop', prop, target)
  }
}

export function Entity<T> (params: {
  name?: string
  primary?: (keyof T)[]
  index?: ((keyof T)[] | {
    name: string
    keys: (keyof T)[]
  })[]
  unique?: ((keyof T)[] | {
    name: string
    keys: (keyof T)[]
  })[]
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
    const primary = Reflect.getMetadata('sqlite:primary', target.prototype) ||
      (params.primary ? { name: params.primary } : undefined)
    const prop = Reflect.getMetadata('sqlite:prop', target.prototype)
    const unique = params.unique ? params.unique.map((u) => {
      return Array.isArray(u) ? {
        name: u.join('_') + '_idx',
        keys: u,
      } : u
    }) : undefined
    const index = params.index ? params.index.map((u) => {
      return Array.isArray(u) ? {
        name: u.join('_') + '_idx',
        keys: u,
      } : u
    }) : undefined

    const __meta: ISqliteMeta<T> = { name, primary, prop, unique, index, createdAt, updatedAt }
    target.prototype.__meta = __meta
  }
}

export interface IPrimaryRow<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends SqliteAllTypes = any
> {
  name: string | string[]
  type?: TSql
  autoincrement: boolean
  default?: RawSQL | T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
  onChange?: T | ((entry: Entry) => T | Promise<T>)
}

export interface IPropRow<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends SqliteAllTypes = any
> {
  type: TSql
  unique?: string
  null: boolean
  index?: string
  collate?: string
  references?: string
  default?: RawSQL | T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
  onChange?: T | ((entry: Entry) => T | Promise<T>)
  transform?: Partial<ITransformer<T>>
}

export interface ISqliteMeta<T> {
  name: string
  primary?: IPrimaryRow
  prop: Partial<Record<keyof T, IPropRow>>
  unique?: {
    name: string
    keys: (keyof T)[]
  }[]
  index?: {
    name: string
    keys: (keyof T)[]
  }[]
  createdAt: boolean
  updatedAt: boolean
}

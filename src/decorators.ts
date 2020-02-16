import 'reflect-metadata'
import { Collection } from './collection'
import { AliasToSqliteType, AliasToJSType, SqliteAllTypes, normalizeAlias } from './utils'

export function primary<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends keyof typeof AliasToSqliteType = any
> (params: {
  name?: string
  type?: TSql
  autoincrement?: boolean
  default?: T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    let type: keyof typeof AliasToSqliteType = params.type || t.name
    type = normalizeAlias(type)

    const name = params.name || key as string || '_id'
    const autoincrement = !!params.autoincrement && ['INTEGER', 'REAL'].includes(AliasToSqliteType[type])
    if (autoincrement) {
      type = 'int'
    }

    const primary: IPrimaryRow<T, Entry> = {
      name,
      type: type as any,
      autoincrement,
      default: autoincrement ? undefined : params.default,
      onUpdate: params.onUpdate,
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
  index?: boolean
  unique?: boolean
  null?: boolean
  references?: string | Collection<any> | { col: Collection<any>; key: string }
  default?: T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    const name = params.name || key as string
    const references = typeof params.references === 'string'
      ? params.references
      : params.references instanceof Collection
        ? `${params.references.name}(${String(params.references.__meta.primary.name)})`
        : typeof params.references === 'object'
          ? `${params.references.col.name}(${params.references.key})`
          : undefined
    let type = typeof params.references === 'object'
      ? params.references instanceof Collection
        ? params.references.__meta.primary.type
        : (params.references.col.__meta.prop[params.references.key] || {}).type
      : params.type || t.name

    type = normalizeAlias(type)

    const prop = Reflect.getMetadata('sqlite:prop', target) || {}

    prop[name] = {
      type,
      unique: params.unique ? params.unique : false,
      null: params.null ? params.null : false,
      index: params.index ? params.index : false,
      references,
      default: params.default ? params.default : undefined,
      onUpdate: params.onUpdate,
    } as IPropRow<T, Entry>

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

export interface IPrimaryRow<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends SqliteAllTypes = any
> {
  name: string | string[]
  type?: TSql
  autoincrement: boolean
  default?: T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
}

export interface IPropRow<
  T extends AliasToJSType[TSql] = any,
  Entry = any,
  TSql extends SqliteAllTypes = any
> {
  type: TSql
  unique: boolean
  null: boolean
  index: boolean
  references?: string
  default?: T | ((entry: Entry) => T | Promise<T>)
  onUpdate?: T | ((entry: Entry) => T | Promise<T>)
}

export interface ISqliteMeta<T> {
  name: string
  primary: IPrimaryRow
  prop: Partial<Record<keyof T, IPropRow>>
  unique?: (keyof T)[][]
  createdAt: boolean
  updatedAt: boolean
}

import 'reflect-metadata'
// eslint-disable-next-line no-unused-vars
import { SqliteNative, SqliteExt } from './collection'

export function primary<T> (params: {
  name?: string
  type?: SqliteNative
  autoincrement?: boolean
  default?: any
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    const type = params.type || (typeMap[t.name] || 'integer') as SqliteNative
    const name = (params.name || key) as keyof T | '_id'
    const autoincrement = (params && params.autoincrement && type === 'integer')

    const primary: IPrimaryRow<T> = {
      name,
      type: (type || typeMap[t.name] || 'integer') as SqliteNative,
      autoincrement: autoincrement !== undefined ? autoincrement : false,
      default: !autoincrement && params && params.default,
    }

    Reflect.defineMetadata('sqlite:primary', primary, target)
  }
}

export function prop (params: {
  name?: string
  type?: SqliteNative | SqliteExt
  unique?: boolean
  null?: boolean
  references?: string
  default?: any
} = {}): PropertyDecorator {
  return function (target, key) {
    const t = Reflect.getMetadata('design:type', target, key)

    const type = params.type || (typeMap[t.name] || 'JSON')
    const name = params.name || key as string

    const prop = Reflect.getMetadata('sqlite:prop', target) || {}

    prop[name] = {
      type,
      unique: (params && params.unique) ? params.unique : false,
      null: (params && params.null) ? params.null : false,
      references: (params && params.references) ? params.references : undefined,
      default: (params && params.default) ? params.default : undefined,
    } as IPropRow

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

export const typeMap: Record<string, SqliteNative | SqliteExt> = {
  String: 'string',
  Number: 'integer',
  Date: 'datetime',
  ArrayBuffer: 'binary',
}

export interface IPrimaryRow<T> {
  name: (keyof T | '_id') | (keyof T)[]
  type?: SqliteNative
  autoincrement?: boolean
  default?: any
}

export interface IPropRow {
  type: SqliteNative | SqliteExt
  unique?: boolean
  null?: boolean
  references?: string
  default?: any
}

export interface ISqliteMeta<T> {
  name: string
  primary: IPrimaryRow<T>
  prop: Partial<Record<keyof T, IPropRow>>
  unique?: (keyof T | '_id')[][]
  createdAt: boolean
  updatedAt: boolean
}

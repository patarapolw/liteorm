// eslint-disable-next-line no-unused-vars
import sqlite from 'sqlite'
import Emittery from 'emittery'

// eslint-disable-next-line no-unused-vars
import { ISqliteMeta, IPropRow } from './decorators'

export type SqliteNative = 'string' | 'integer' | 'float' | 'binary'
export type SqliteExt = 'datetime' | 'JSON' | 'strArray'

interface ITransformer<T> {
  get: (repr: string | null) => T | null
  set: (data: T) => string | null
}

export interface ISql {
  $statement: string
  $params: any[]
}

export class Collection<T> extends Emittery.Typed<{
  'build': ISql
  'pre-create': {
    entry: T & {
      createdAt?: Date
      updatedAt?: Date
    }
    ignoreErrors: boolean
  }
  'create': ISql
  'pre-find': {
    cond: string | Record<string, any>
    fields?: string[] | null
    postfix?: string
  }
  'find': ISql
  'pre-update': {
    cond: string | Record<string, any>
    set: Partial<T & {
      createdAt?: Date
      updatedAt?: Date
    }>
  }
  'update': ISql
  'pre-delete': {
    cond: string | Record<string, any>
  }
  'delete': ISql
}> {
  __meta: {
    fields: Array<keyof T | '_id'>
    transform: Record<SqliteExt, ITransformer<any>>
  } & ISqliteMeta<T & {
    createdAt?: Date
    updatedAt?: Date
  }>

  db: sqlite.Database
  name: string

  constructor (
    db: sqlite.Database,
    model: T,
  ) {
    super()

    const { name, primary, unique, prop, createdAt, updatedAt } = (model as any).__meta as ISqliteMeta<T>

    this.db = db
    this.name = name
    const fields: Array<keyof T | '_id'> = []
    if (primary.name) {
      if (Array.isArray(primary.name)) {
        fields.push(...primary.name)
      } else {
        fields.push(primary.name)
      }
    }
    fields.push(...Object.keys(prop) as any[])

    this.__meta = {
      name,
      primary,
      prop: {
        ...prop,
        createdAt: createdAt ? { type: 'datetime', null: false, default: () => new Date() } : undefined,
        updatedAt: updatedAt ? { type: 'datetime', null: false, default: () => new Date() } : undefined,
      },
      fields,
      unique,
      transform: {
        datetime: {
          get: (repr) => repr ? new Date(JSON.parse(repr).$milli) : null,
          set: (d) => d ? JSON.stringify({ $string: d.toISOString(), $milli: +d }) : null,
        },
        JSON: {
          get: (repr) => repr ? JSON.parse(repr) : null,
          set: (data) => data ? JSON.stringify(data) : null,
        },
        strArray: {
          get: (repr) => repr ? repr.trim().split('\x1f') : null,
          set: (d) => d ? '\x1f' + d.join('\x1f') + '\x1f' : null,
        },
      },
      createdAt,
      updatedAt,
    }

    if (updatedAt) {
      this.on('pre-update', ({ set }) => {
        set.updatedAt = set.updatedAt || new Date()
      })
    }
  }

  async build () {
    const typeMap: Record<SqliteNative | SqliteExt, string> = {
      string: 'TEXT',
      integer: 'INTEGER',
      float: 'FLOAT',
      binary: 'BLOB',
      datetime: 'JSON',
      JSON: 'JSON',
      strArray: 'TEXT',
    }

    const getDefault = (k: string, v: {
      default?: any
      type?: string
    }) => {
      if (typeof v.default === 'string') {
        return `DEFAULT '${v.default.replace(/'/g, "[']")}'`
      } else if (typeof v.default === 'number') {
        return `DEFAULT ${v.default}`
      } else if (typeof v.default === 'boolean') {
        return `DEFAULT ${v.default.toString().toLocaleUpperCase()}`
      } else if (typeof v.default === 'function') {
        this.on('pre-create', ({ entry }) => {
          (entry as any)[k] = (entry as any)[k] || v.default!(entry)
        })
      } else if (v.type && (this.__meta.transform as any)[v.type]) {
        return `DEFAULT ${(this.__meta.transform as any)[v.type](v.default)}`
      }

      return ''
    }

    const col: string[] = []

    if (this.__meta.primary.type) {
      col.push([
        `"${this.__meta.primary.name}"`,
        typeMap[this.__meta.primary.type] || 'INTEGER',
        'PRIMARY KEY',
        this.__meta.primary.autoincrement ? 'AUTOINCREMENT' : '',
        getDefault(this.__meta.primary.name as string, this.__meta.primary),
      ].join(' '))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.__meta.prop as any)) {
      if (v && v.type) {
        col.push([
          `"${k}"`,
          typeMap[v.type] || 'INTEGER',
          v.unique ? 'UNIQUE' : '',
          v.null ? '' : 'NOT NULL',
          getDefault(k, v),
          v.references ? `REFERENCES "${v.references}"` : '',
        ].join(' '))
      }
    }

    if (Array.isArray(this.__meta.primary.name)) {
      col.push([
        'PRIMARY KEY',
        `(${this.__meta.primary.name.join(',')})`,
      ].join(' '))
    }

    if (this.__meta.unique && this.__meta.unique.length > 0) {
      this.__meta.unique.forEach((ss) => {
        col.push([
          'UNIQUE',
          `(${ss.join(',')})`,
        ].join(' '))
      })
    }

    const sql: ISql = {
      $statement: `CREATE TABLE IF NOT EXISTS "${this.name}" (${col.join(',')})`,
      $params: [],
    }

    await this.emit('build', sql)
    await this.db.exec(sql.$statement)

    return this
  }

  async create (entry: T, ignoreErrors = false): Promise<number> {
    await this.emit('pre-create', { entry, ignoreErrors })

    const bracketed: string[] = []
    const values: string[] = []

    for (let [k, v] of Object.entries(entry)) {
      const prop = (this.__meta.prop as any)[k]
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type]
        if (tr) {
          v = tr.set(v)
        }
      }

      bracketed.push(k)
      values.push(v)
    }

    const sql = {
      $statement: `
      INSERT INTO "${this.name}" (${bracketed.map((el) => `"${el}"`).join(',')})
      VALUES (${values.map((_) => '?').join(',')})
      ${ignoreErrors ? 'ON CONFLICT DO NOTHING' : ''}`,
      $params: values,
    }

    await this.emit('create', sql)
    const r = await this.db.run(sql.$statement, ...sql.$params)

    return r.lastID
  }

  /**
   *
   * @param cond Put in `{ $statement: string, $params: any[] }` to directly use SQL
   * @param fields Put in empty array or `null` to select all fields
   * @param postfix Put in stuff like `ORDER BY` or `LIMIT` to enhance queries
   */
  async find (
    cond: Record<string, any>,
    fields?: string[] | null,
    postfix?: string,
  ): Promise<Partial<T>[]> {
    await this.emit('pre-find', { cond, fields, postfix })

    const where = _parseCond(cond)

    const selectClause: string[] = []
    if (!fields || fields.length === 0) {
      selectClause.push('*')
    } else {
      fields.forEach((f) => {
        selectClause.push(f.split('.')[0])
      })
    }

    const sql: ISql = {
      $statement: `
      SELECT ${selectClause.join(',')}
      FROM "${this.name}"
      ${where ? `WHERE ${where.$statement}` : ''} ${postfix || ''}`,
      $params: where ? where.$params.map((el) => el === undefined ? null : el) : [],
    }

    await this.emit('find', sql)
    const r = (await this.db.all(sql.$statement,
      ...sql.$params)).map((el) => this._loadData(el))

    return r
  }

  async get (
    cond: Record<string, any>,
    fields?: string[],
  ): Promise<Partial<T> | null> {
    return (await this.find(cond, fields, 'LIMIT 1'))[0] || null
  }

  async update (
    cond: Record<string, any>,
    set: Partial<T>,
  ) {
    await this.emit('pre-update', { cond, set })

    const setK: string[] = []
    const setV: any[] = []
    const where = _parseCond(cond)

    for (let [k, v] of Object.entries<any>(set)) {
      const prop = (this.__meta.prop as any)[k]
      if (prop) {
        const { type } = prop
        const tr = type ? (this.__meta.transform as any)[type] : undefined
        if (tr) {
          v = tr.set(v)
        }

        setK.push(`"${k}" = ?`)
        setV.push(v)
      }
    }

    const sql: ISql = {
      $statement: `
      UPDATE "${this.name}"
      SET ${setK.join(',')}
      ${where ? `WHERE ${where.$statement}` : ''}`,
      $params: [
        ...setV,
        ...(where ? where.$params.map((el) => el === undefined ? null : el) : []),
      ],
    }

    await this.emit('update', sql)
    await this.db.run(sql.$statement,
      ...sql.$params)
  }

  async delete (
    cond: Record<string, any>,
  ) {
    await this.emit('pre-delete', { cond })

    const where = _parseCond(cond)

    const sql: ISql = {
      $statement: `
      DELETE FROM "${this.name}"
      ${where ? `WHERE ${where.$statement}` : ''}`,
      $params: (where ? where.$params.map((el) => el === undefined ? null : el) : []),
    }

    await this.emit('delete', sql)
    await this.db.run(sql.$statement,
      ...sql.$params)
  }

  chain (select?: Array<keyof T> | Record<keyof T, string>): Chain<T> {
    return new Chain(this, select)
  }

  transformEntry (entry: Partial<T>): Record<string, string | number | null> {
    const output: Record<string, string | number | null> = {}

    for (const [k, v] of Object.entries<any>(entry)) {
      const prop = (this.__meta.prop as any)[k]
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type]
        if (tr) {
          output[k] = tr.set(v)
        }
      }

      if (output[k] === undefined) {
        output[k] = v
      }
    }

    return output
  }

  private _loadData (data: any): Partial<T> {
    for (const [k, v] of Object.entries(data)) {
      const prop = (this.__meta.prop as any)[k]
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type]
        if (tr) {
          data[k] = tr.get(v)
        }
      }
    }

    return data
  }
}

class Chain<T> {
  cols: Record<string, Collection<any>> = {}
  firstCol: Collection<T>

  select: Record<string, string> = {}
  from: string[] = []

  constructor (firstCol: Collection<T>, firstSelect?: Array<keyof T> | Record<keyof T, string>) {
    this.cols[firstCol.name] = firstCol
    this.firstCol = firstCol

    if (firstSelect) {
      if (Array.isArray(firstSelect)) {
        for (const l of firstSelect) {
          this.select[`"${firstCol.name}"."${l}"`] = `${firstCol.name}__${l}`
        }
      } else {
        for (const [l, v] of Object.entries<string>(firstSelect)) {
          this.select[`"${firstCol.name}"."${l}"`] = v
        }
      }
    }

    this.from.push(`FROM "${firstCol.name}"`)
  }

  get db () {
    return this.firstCol.db
  }

  join<U> (
    to: Collection<U>,
    foreignField: string,
    localField: keyof T = '_id' as any,
    select?: Array<keyof U> | Record<keyof U, string> | null,
    type?: 'left' | 'inner',
  ): this {
    if (select) {
      if (Array.isArray(select)) {
        for (const l of select) {
          this.select[`"${to.name}"."${l}"`] = `${to.name}__${l}`
        }
      } else {
        for (const [l, v] of Object.entries<string>(select)) {
          this.select[`"${to.name}"."${l}"`] = v
        }
      }
    }

    this.from.push(`${type || ''} JOIN "${to.name}" ON "${foreignField}" = "${to.name}".${localField}`)
    this.cols[to.name] = to

    return this
  }

  sql (
    cond?: Record<string, any>,
    postfix?: string,
  ): ISql {
    const where = cond ? _parseCond(cond) : null

    return {
      $statement: `
      SELECT ${Object.entries(this.select).map(([k, v]) => `${k} AS "${v}"`).join(',')}
      ${this.from.join('\n')}
      ${where ? `WHERE ${where.$statement}` : ''}
      ${postfix || ''}`,
      $params: where ? where.$params : [],
    }
  }

  async data (
    cond?: Record<string, any>,
    postfix?: string,
  ): Promise<Array<Record<string, Record<string, any>>>> {
    const sql = this.sql(cond, postfix)

    return (await this.db.all(sql.$statement, sql.$params)).map((c) => {
      return this.transformRow(c)
    })
  }

  transformRow (row: any) {
    const item: Record<string, Record<string, any>> = {}

    for (const [k, v] of Object.entries<any>(row)) {
      const [tableName, r] = k.split('__')

      const prop = (this.cols[tableName].__meta.prop as any)[r]
      if (prop && prop.type) {
        const tr = (this.cols[tableName].__meta.transform as any)[prop.type]
        if (tr) {
          item[tableName] = item[tableName] || {}
          item[tableName][r] = tr.get(v)
        }
      }

      item[tableName] = item[tableName] || {}
      if (item[tableName][r] === undefined) {
        item[tableName][r] = v
      }
    }

    return item
  }
}

function _parseCond (q: Record<string, any>): ISql {
  if (q.$statement) {
    return {
      $statement: q.$statement,
      $params: q.$params || [],
    }
  }

  const subClause: string[] = []
  const params: any[] = []

  if (Array.isArray(q.$or)) {
    const c = q.$or.map((el) => {
      const r = _parseCond(el)
      params.push(...r.$params)

      return r.$statement
    }).join(' OR ')

    subClause.push(`(${c})`)
  } else if (Array.isArray(q.$and)) {
    const c = q.$and.map((el) => {
      const r = _parseCond(el)
      params.push(...r.$params)

      return r.$statement
    }).join(' AND ')

    subClause.push(`(${c})`)
  } else {
    const r = _parseCondBasic(q)

    subClause.push(`(${r.$statement})`)
    params.push(...r.$params)
  }

  return {
    $statement: subClause.join(' AND ') || 'TRUE',
    $params: params,
  }
}

function _parseCondBasic (cond: Record<string, any>): ISql {
  if (cond.$statement) {
    return {
      $statement: cond.$statement,
      $params: cond.$params || [],
    }
  }

  const cList: string[] = []
  const params: any[] = []

  for (let [k, v] of Object.entries(cond)) {
    if (k.includes('.')) {
      const kn = k.split('.')
      k = `json_extract(${kn[0]}, '$.${kn.slice(1).join('.')}')`
    }

    if (v instanceof Date) {
      k = `json_extract(${k}, '$.$milli')`
      v = +v
    }

    if (v) {
      if (Array.isArray(v)) {
        if (v.length > 1) {
          cList.push(`${k} IN (${v.map((_: any) => '?').join(',')})`)
          params.push(...v)
        } else {
          cList.push(`${k} = ?`)
          params.push(v[0])
        }
      } else if (typeof v === 'object' && v.toString() === '[object Object]') {
        const op = Object.keys(v)[0]
        let v1 = v[op]
        if (Array.isArray(v1)) {
          switch (op) {
            case '$in':
              if (v1.length > 1) {
                cList.push(`${k} IN (${v1.map((_: any) => '?').join(',')})`)
                params.push(...v1)
              } else {
                cList.push(`${k} = ?`)
                params.push(v1[0])
              }
              break
            case '$nin':
              if (v1.length > 1) {
                cList.push(`${k} NOT IN (${v1.map((_: any) => '?').join(',')})`)
                params.push(...v1)
              } else {
                cList.push(`${k} != ?`)
                params.push(v1[0])
              }
              break
          }
          v1 = JSON.stringify(v1)
        }

        if (v1 && typeof v1 === 'object') {
          if (v1 instanceof Date) {
            k = `json_extract(${k}, '$.$milli')`
            v1 = +v1
          } else {
            v1 = JSON.stringify(v1)
          }
        }

        switch (op) {
          case '$like':
            cList.push(`${k} LIKE ?`)
            params.push(v1)
            break
          case '$nlike':
            cList.push(`${k} NOT LIKE ?`)
            params.push(v1)
            break
          case '$substr':
            cList.push(`${k} LIKE ?`)
            params.push(`%${v1.replace(/[%_[]/g, '[$&]')}%`)
            break
          case '$nsubstr':
            cList.push(`${k} NOT LIKE ?`)
            params.push(`%${v1.replace(/[%_[]/g, '[$&]')}%`)
            break
          case '$exists':
            cList.push(`${k} IS ${v1 ? 'NOT NULL' : 'NULL'}`)
            break
          case '$gt':
            cList.push(`${k} > ?`)
            params.push(v1)
            break
          case '$gte':
            cList.push(`${k} >= ?`)
            params.push(v1)
            break
          case '$lt':
            cList.push(`${k} < ?`)
            params.push(v1)
            break
          case '$lte':
            cList.push(`${k} <= ?`)
            params.push(v1)
            break
          case '$ne':
            cList.push(`${k} != ?`)
            params.push(v)
            break
          default:
            cList.push(`${k} = ?`)
            params.push(v)
        }
      } else {
        cList.push(`${k} = ?`)
        params.push(v)
      }
    } else {
      cList.push(`${k} = ?`)
      params.push(v)
    }
  }

  return {
    $statement: cList.join(' AND ') || 'TRUE',
    $params: params,
  }
}

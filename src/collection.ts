import sqlite from 'sqlite'
import Emittery from 'emittery'
import nanoid from 'nanoid'

import { ISqliteMeta, IPropRow } from './decorators'

export type SqliteNative = 'string' | 'integer' | 'float' | 'binary'
export type SqliteExt = 'datetime' | 'JSON' | 'strArray' | 'boolean'

interface ITransformer<T> {
  get: (repr: any) => T | null
  set: (data: T) => any
}

export interface ISql {
  $statement: string
  $params: Record<string, any>
}

export type IEntry<T> = T & {
  createdAt?: Date
  updatedAt?: Date
}

export class Collection<T> extends Emittery.Typed<{
  'build': ISql
  'pre-create': {
    entry: IEntry<T>
    options: {
      postfix: string
    }
  }
  'create': ISql
  'pre-find': {
    cond: Record<string, any>
    /**
     * Fields are mostly `keyof IEntry<T>`, but can also be functions, like `COUNT(_id)`
     */
    fields: Record<string, string>
    options: {
      postfix: string
    }
  }
  'find': ISql
  'pre-update': {
    cond: Record<string, any>
    set: Partial<IEntry<T>>
    options: {
      postfix: string
    }
  }
  'update': ISql
  'pre-delete': {
    cond: Record<string, any>
    options: {
      postfix: string
    }
  }
  'delete': ISql
}> {
  __meta: {
    fields: Array<keyof T | '_id'>
    transform: Record<SqliteExt, ITransformer<any>>
  } & ISqliteMeta<IEntry<T>>

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
        boolean: {
          get: (repr) => typeof repr === 'number' ? !!repr : null,
          set: (d) => typeof d === 'boolean' ? Number(d) : null,
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

  /**
   * Normally, you don't have to call this method. It is automatically built on `await db.collection()`
   *
   * Has no effect if call repeatedly.
   */
  async build () {
    const typeMap: Record<SqliteNative | SqliteExt, string> = {
      string: 'TEXT',
      integer: 'INTEGER',
      float: 'FLOAT',
      binary: 'BLOB',
      datetime: 'JSON',
      JSON: 'JSON',
      strArray: 'TEXT',
      boolean: 'INTEGER',
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
        return `DEFAULT ${(this.__meta.transform as any)[v.type].set(v.default)}`
      }

      return ''
    }

    const col: string[] = []

    if (this.__meta.primary.type) {
      col.push([
        safeColumnName(this.__meta.primary.name as string),
        typeMap[this.__meta.primary.type] || 'INTEGER',
        'PRIMARY KEY',
        this.__meta.primary.autoincrement ? 'AUTOINCREMENT' : '',
        getDefault(this.__meta.primary.name as string, this.__meta.primary),
      ].join(' '))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.__meta.prop as any)) {
      if (v && v.type) {
        col.push([
          safeColumnName(k),
          typeMap[v.type] || 'INTEGER',
          v.unique ? 'UNIQUE' : '',
          v.null ? '' : 'NOT NULL',
          getDefault(k, v),
          v.references ? `REFERENCES ${safeColumnName(v.references)}` : '',
        ].join(' '))
      }
    }

    if (Array.isArray(this.__meta.primary.name)) {
      col.push([
        'PRIMARY KEY',
        `(${this.__meta.primary.name.map((k) => safeColumnName(k as string)).join(',')})`,
      ].join(' '))
    }

    if (this.__meta.unique && this.__meta.unique.length > 0) {
      this.__meta.unique.forEach((ss) => {
        col.push([
          'UNIQUE',
          `(${ss.map((k) => safeColumnName(k as string)).join(',')})`,
        ].join(' '))
      })
    }

    const sql: ISql = {
      $statement: [
        'CREATE TABLE IF NOT EXISTS',
        safeColumnName(this.name),
        `(${col.join(',')})`,
      ].join(' '),
      $params: [],
    }

    await this.emit('build', sql)
    await this.db.exec(sql.$statement)

    return this
  }

  /**
   * The standard INSERT command
   *
   * @param entry The entry to insert
   * @param options
   */
  async create (
    entry: T,
    options: {
      postfix?: string
      ignoreErrors?: boolean
    } = {},
  ): Promise<number> {
    if (options.ignoreErrors) {
      options.postfix = options.postfix || 'ON CONFLICT DO NOTHING'
    }

    const postfix = options.postfix || ''

    await this.emit('pre-create', { entry, options: { postfix } })

    const bracketed: string[] = []
    const values: Record<string, any> = {}

    for (let [k, v] of Object.entries(entry)) {
      const prop = (this.__meta.prop as any)[k]
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type]
        if (tr) {
          v = tr.set(v)
        }
      }

      bracketed.push(k)
      Object.assign(values, { [`$${getId()}`]: v })
    }

    const sql = {
      $statement: [
        `INSERT INTO ${safeColumnName(this.name)}`,
        `(${bracketed.map(safeColumnName).join(',')})`,
        `VALUES (${Object.keys(values).join(',')})`,
        postfix,
      ].join(' '),
      $params: values,
    }

    await this.emit('create', sql)
    const r = await this.db.run(sql.$statement, sql.$params)

    return r.lastID
  }

  /**
   *
   * @param cond Put in `{ $statement: string, $params: any[] }` to directly use SQL
   * @param fields Put in empty array or `null` to select all fields. `COUNT(_id)` is also allowed.
   * @param options
   */
  async find (
    cond: Record<string, any>,
    fields?: string[] | Record<string, string> | null,
    options: {
      postfix?: string
      sort?: {
        key: keyof IEntry<T>
        desc?: boolean
      }
      offset?: number
      limit?: number
    } = {},
  ): Promise<Partial<T>[]> {
    if (!fields) {
      fields = {}
    }
    if (Array.isArray(fields)) {
      fields = fields.map((c) => c.split('.')[0]).reduce((prev, c) => ({ ...prev, [c]: c }), {})
    }

    let postfix = options.postfix || ''
    if (options.sort) {
      postfix += ` ORDER BY ${safeColumnName(options.sort.key as string)} ${options.sort.desc ? 'DESC' : 'ASC'}`
    }
    if (options.limit) {
      postfix += ` LIMIT ${options.limit}`
    }
    if (options.offset) {
      postfix += ` OFFSET ${options.offset}`
    }

    await this.emit('pre-find', { cond, fields, options: { postfix } })

    const where = _parseCond(cond)

    const selectClause: string[] = []

    if (Object.keys(fields).length > 0) {
      Object.entries(fields).map(([k, v]) => {
        selectClause.push(`${safeColumnName(k)} AS ${safeColumnName(v)}`)
      })
    } else {
      selectClause.push('*')
    }

    const sql: ISql = {
      $statement: [
        `SELECT ${selectClause.join(',')}`,
        `FROM ${this.name}`,
        where ? `WHERE ${where.$statement}` : '',
        postfix,
      ].join(' '),
      $params: where ? where.$params : {},
    }

    await this.emit('find', sql)
    const r = (await this.db.all(sql.$statement, sql.$params)).map((el) => this._loadData(el))

    return r
  }

  /**
   * Similar to `find`, but always limit to 1 item
   *
   * @param cond
   * @param fields
   */
  async get (
    cond: Record<string, any>,
    fields?: string[] | Record<string, string>,
  ): Promise<Partial<T> | null> {
    return (await this.find(cond, fields, { limit: 1 }))[0] || null
  }

  /**
   *
   * @param cond
   * @param set
   * @param options
   */
  async update (
    cond: Record<string, any>,
    set: Partial<IEntry<T>>,
    options: {
      postfix?: string
      // limit?: number
    } = {},
  ) {
    const postfix = options.postfix || ''
    // if (options.limit) {
    //   postfix += ` LIMIT ${options.limit}`
    // }

    await this.emit('pre-update', { cond, set, options: { postfix } })

    const setK: string[] = []
    const setV: Record<string, any> = {}
    const where = _parseCond(cond)

    for (let [k, v] of Object.entries<any>(set)) {
      const prop = (this.__meta.prop as any)[k]
      if (prop) {
        const { type } = prop
        const tr = type ? (this.__meta.transform as any)[type] : undefined
        if (tr) {
          v = tr.set(v)
        }

        const id = `$${getId()}`

        setK.push(`${k} = ${id}`)
        setV[id] = v
      }
    }

    const sql: ISql = {
      $statement: [
        `UPDATE ${safeColumnName(this.name)}`,
        `SET ${setK.map(safeColumnName).join(',')}`,
        `${where ? `WHERE ${where.$statement}` : ''}`,
        postfix,
      ].join(' '),
      $params: {
        ...setV,
        ...(where ? where.$params : {}),
      },
    }

    await this.emit('update', sql)
    await this.db.run(sql.$statement, sql.$params)
  }

  /**
   *
   * @param cond
   * @param options
   */
  async delete (
    cond: Record<string, any>,
    options: {
      postfix?: string
      // limit?: number
    } = {},
  ) {
    const postfix = options.postfix || ''
    // if (options.limit) {
    //   postfix += ` LIMIT ${options.limit}`
    // }

    await this.emit('pre-delete', { cond, options: { postfix } })

    const where = _parseCond(cond)

    const sql: ISql = {
      $statement: [
        `DELETE FROM ${safeColumnName(this.name)}`,
        `${where ? `WHERE ${where.$statement}` : ''}`,
        postfix,
      ].join(' '),
      $params: (where ? where.$params : {}),
    }

    await this.emit('delete', sql)
    await this.db.run(sql.$statement, sql.$params)
  }

  /**
   * Do joining
   *
   * ```ts
   * col1.chain().join(col2, 'colId')
   * ```
   *
   * @param select Limit fields before joining
   */
  chain (select?: Array<keyof T> | Record<keyof T, string>): Chain<T> {
    return new Chain(this, select)
  }

  /**
   * Normally, you wouldn't need to call this direcly, but it works by converting custom entry to native
   *
   * @param entry
   */
  transformEntry (entry: Partial<T>): Record<string, string | number | boolean | null> {
    const output: Record<string, string | number | boolean | null> = {}

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

class Chain<T> extends Emittery.Typed<{
  join: Chain<T>
  'pre-data': {
    cond: Record<string, any>
    options: {
      postfix: string
    }
  }
  data: ISql
}> {
  cols: Record<string, Collection<any>> = {}
  firstCol: Collection<T>

  select: Record<string, string> = {}
  from: string[] = []

  constructor (firstCol: Collection<T>, firstSelect?: Array<keyof T> | Record<keyof T, string>) {
    super()

    this.cols[firstCol.name] = firstCol
    this.firstCol = firstCol

    if (firstSelect) {
      if (Array.isArray(firstSelect)) {
        for (const l of firstSelect) {
          this.select[safeColumnName(`${firstCol.name}.${l}`)] = safeColumnName(`${firstCol.name}__${l}`)
        }
      } else {
        for (const [l, v] of Object.entries<string>(firstSelect)) {
          this.select[safeColumnName(`${firstCol.name}.${l}`)] = safeColumnName(v)
        }
      }
    }

    this.from.push(`FROM ${safeColumnName(firstCol.name)}`)
  }

  get db () {
    return this.firstCol.db
  }

  /**
   *
   * @param to
   * @param foreignField
   * @param localField
   * @param select
   * @param type
   */
  join<U> (
    to: Collection<U>,
    foreignField: string | [string, string],
    localField: keyof IEntry<U> = '_id' as any,
    select?: Array<keyof U> | Record<keyof U, string> | null,
    type?: 'left' | 'inner',
  ): this {
    if (select) {
      if (Array.isArray(select)) {
        for (const l of select) {
          this.select[safeColumnName(`${to.name}.${l}`)] = safeColumnName(`${to.name}__${l}`)
        }
      } else {
        for (const [l, v] of Object.entries<string>(select)) {
          this.select[safeColumnName(`${to.name}.${l}`)] = v
        }
      }
    }

    if (Array.isArray(foreignField)) {
      foreignField = foreignField.join('__')
    }

    this.from.push(
      `${type || ''} JOIN ${safeColumnName(to.name)}`,
      `ON ${safeColumnName(foreignField)} = ${safeColumnName(to.name)}.${localField}`)
    this.cols[to.name] = to

    this.emit('join', this)

    return this
  }

  async data (
    cond: Record<string, any> = {},
    options: {
      postfix?: string
      sort?: {
        key: string
        desc?: boolean
      }
      offset?: number
      limit?: number
    } = {},
  ): Promise<Array<Record<string, Record<string, any>>>> {
    let postfix = options.postfix || ''
    if (options.sort) {
      postfix += ` ORDER BY ${safeColumnName(options.sort.key)} ${options.sort.desc ? 'DESC' : 'ASC'}`
    }
    if (options.limit) {
      postfix += ` LIMIT ${options.limit}`
    }
    if (options.offset) {
      postfix += ` OFFSET ${options.offset}`
    }

    await this.emit('pre-data', { cond, options: { postfix } })

    const where = _parseCond(cond)

    const sql = {
      $statement: [
        `SELECT ${Object.entries(this.select).map(([k, v]) => `${safeColumnName(k)} AS ${safeColumnName(v)}`).join(',')}`,
        this.from.join('\n'),
        where ? `WHERE ${where.$statement}` : '',
        postfix,
      ].join(' '),
      $params: where ? where.$params : {},
    }

    await this.emit('data', sql)

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
      $params: q.$params || {},
    }
  }

  const subClause: string[] = []
  const $params: Record<string, any> = {}

  if (Array.isArray(q.$or)) {
    const c = q.$or.map((el) => {
      const r = _parseCond(el)
      Object.assign($params, r.$params)

      return r.$statement
    }).join(' OR ')

    subClause.push(`(${c})`)
  } else if (Array.isArray(q.$and)) {
    const c = q.$and.map((el) => {
      const r = _parseCond(el)
      Object.assign($params, r.$params)

      return r.$statement
    }).join(' AND ')

    subClause.push(`(${c})`)
  } else {
    const r = _parseCondBasic(q)

    subClause.push(`(${r.$statement})`)
    Object.assign($params, r.$params)
  }

  return {
    $statement: subClause.join(' AND ') || 'TRUE',
    $params,
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
  const $params: Record<string, any> = {}

  for (let [k, v] of Object.entries(cond)) {
    if (k.includes('.')) {
      const kn = k.split('.')
      k = `json_extract(${safeColumnName(kn[0])}, '$.${safeColumnName(kn.slice(1).join('.'))}')`
    } else {
      k = safeColumnName(k)
    }

    if (v instanceof Date) {
      k = `json_extract(${k}, '$.$milli')`
      v = +v
    }

    const id = `$${getId()}`

    if (v) {
      if (Array.isArray(v)) {
        if (v.length > 1) {
          const vObj = v.reduce((prev, c) => ({ ...prev, [`$${getId()}`]: c }), {})
          cList.push(`${k} IN (${Object.keys(vObj).join(',')})`)
          Object.assign($params, vObj)
        } else if (v.length === 1) {
          const id = `$${getId()}`
          cList.push(`${k} = ${id}`)
          Object.assign($params, { [id]: v[0] })
        }
      } else if (typeof v === 'object' && v.toString() === '[object Object]') {
        const op = Object.keys(v)[0]
        let v1 = v[op]
        if (Array.isArray(v1)) {
          switch (op) {
            case '$in':
              if (v1.length > 1) {
                const vObj = v1.reduce((prev, c) => ({ ...prev, [`$${getId()}`]: c }), {})
                cList.push(`${k} IN (${Object.keys(vObj).join(',')})`)
                Object.assign($params, vObj)
              } else if (v1.length === 1) {
                const id = `$${getId()}`
                cList.push(`${k} = ${id}`)
                Object.assign($params, { [id]: v1[0] })
              }
              break
            case '$nin':
              if (v1.length > 1) {
                const vObj = v1.reduce((prev, c) => ({ ...prev, [`$${getId()}`]: c }), {})
                cList.push(`${k} NOT IN (${Object.keys(vObj).join(',')})`)
                Object.assign($params, vObj)
              } else {
                const id = `$${getId()}`
                cList.push(`${k} != ${id}`)
                Object.assign($params, { [id]: v1[0] })
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
            cList.push(`${k} LIKE ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          case '$nlike':
            cList.push(`${k} NOT LIKE ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          case '$substr':
            cList.push(`${k} LIKE '%'||${id}||'%'`)
            Object.assign($params, { [id]: v1 })
            break
          case '$nsubstr':
            cList.push(`${k} NOT LIKE '%'||${id}||'%'`)
            Object.assign($params, { [id]: v1 })
            break
          case '$exists':
            cList.push(`${k} IS ${v1 ? 'NOT NULL' : 'NULL'}`)
            break
          case '$gt':
            cList.push(`${k} > ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          case '$gte':
            cList.push(`${k} >= ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          case '$lt':
            cList.push(`${k} < ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          case '$lte':
            cList.push(`${k} <= ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          case '$ne':
            cList.push(`${k} != ${id}`)
            Object.assign($params, { [id]: v1 })
            break
          default:
            cList.push(`${k} = ${id}`)
            Object.assign($params, { [id]: v1 })
        }
      } else {
        cList.push(`${k} = ${id}`)
        Object.assign($params, { [id]: v })
      }
    } else {
      cList.push(`${k} = ${id}`)
      Object.assign($params, { [id]: v })
    }
  }

  return {
    $statement: cList.join(' AND ') || 'TRUE',
    $params,
  }
}

/**
 * https://stackoverflow.com/questions/31788990/sqlite-what-are-the-restricted-characters-for-identifiers
 */
function getId () {
  return nanoid().replace(/-/g, '$')
}

/**
 * https://www.sqlite.org/lang_keywords.html
 * @param s identifier
 */
function safeColumnName (s: string) {
  const keywords = `
    ABORT
    ACTION
    ADD
    AFTER
    ALL
    ALTER
    ALWAYS
    ANALYZE
    AND
    AS
    ASC
    ATTACH
    AUTOINCREMENT
    BEFORE
    BEGIN
    BETWEEN
    BY
    CASCADE
    CASE
    CAST
    CHECK
    COLLATE
    COLUMN
    COMMIT
    CONFLICT
    CONSTRAINT
    CREATE
    CROSS
    CURRENT
    CURRENT_DATE
    CURRENT_TIME
    CURRENT_TIMESTAMP
    DATABASE
    DEFAULT
    DEFERRABLE
    DEFERRED
    DELETE
    DESC
    DETACH
    DISTINCT
    DO
    DROP
    EACH
    ELSE
    END
    ESCAPE
    EXCEPT
    EXCLUDE
    EXCLUSIVE
    EXISTS
    EXPLAIN
    FAIL
    FILTER
    FIRST
    FOLLOWING
    FOR
    FOREIGN
    FROM
    FULL
    GENERATED
    GLOB
    GROUP
    GROUPS
    HAVING
    IF
    IGNORE
    IMMEDIATE
    IN
    INDEX
    INDEXED
    INITIALLY
    INNER
    INSERT
    INSTEAD
    INTERSECT
    INTO
    IS
    ISNULL
    JOIN
    KEY
    LAST
    LEFT
    LIKE
    LIMIT
    MATCH
    NATURAL
    NO
    NOT
    NOTHING
    NOTNULL
    NULL
    NULLS
    OF
    OFFSET
    ON
    OR
    ORDER
    OTHERS
    OUTER
    OVER
    PARTITION
    PLAN
    PRAGMA
    PRECEDING
    PRIMARY
    QUERY
    RAISE
    RANGE
    RECURSIVE
    REFERENCES
    REGEXP
    REINDEX
    RELEASE
    RENAME
    REPLACE
    RESTRICT
    RIGHT
    ROLLBACK
    ROW
    ROWS
    SAVEPOINT
    SELECT
    SET
    TABLE
    TEMP
    TEMPORARY
    THEN
    TIES
    TO
    TRANSACTION
    TRIGGER
    UNBOUNDED
    UNION
    UNIQUE
    UPDATE
    USING
    VACUUM
    VALUES
    VIEW
    VIRTUAL
    WHEN
    WHERE
    WINDOW
    WITH
    WITHOUT`
    .split('\n')
    .map((el) => el.trim())
    .filter((el) => el)

  const kwRegex = new RegExp(`(^|[^A-Z])(${keywords.join('|')})($|[^A-Z])`, 'gi')

  return s.replace(kwRegex, '$1"$2"$3')
}

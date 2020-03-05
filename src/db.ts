import sqlite3 from 'sqlite3'
import Emittery from 'emittery'

import { Table, Column, UndefinedEqNull } from './table'
import { parseCond } from './find'
import { safeColumnName, SQLParams, RawSQL, sql } from './utils'

try {
  require('bluebird-global')
} catch (_) {}

export class Db extends Emittery.Typed<{
  'pre-find': {
    cond: any
    tables: {
      type?: 'inner' | 'left' | 'cross' | 'natural'
      from?: Column
      cond?: string
      to: Column | Table<any>
    }[]
    select: {
      [alias: string]: string | RawSQL | Column
    }
    options: {
      postfix?: string
      sort?: {
        key: Column | string
        desc?: boolean
      }
      offset?: number
      limit?: number
    }
  }
  'find-sql': {
    stmt: string
    params: SQLParams
  }
}> {
  sql: sqlite3.Database

  constructor (
    filename: string | sqlite3.Database, options?: any,
  ) {
    super()

    this.sql = typeof filename === 'string'
      ? new sqlite3.Database(filename, options)
      : filename
  }

  /**
   * Initialize tables sequentially, just in case foreign keys matter
   *
   * @param tables
   */
  async init (tables: Table<any>[]) {
    for (const t of tables) {
      await t.__init(this.sql)
    }
  }

  create<E> (table: Table<E>) {
    return table.create(this.sql)
  }

  each (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return <
      Select extends {
        [alias: string]: string | RawSQL | Column
      } = typeof table0['c'],
      R = UndefinedEqNull<{
        [K in keyof Select]: Select[K] extends Column<infer T> ? T : any
      }>
    >(
      qCond: Record<string, any>,
      select: Select | '*',
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      return async (cb: (r: R) => void) => {
        return (await this._find(table0, ...tables)(qCond, select, options)).each(cb as any)
      }
    }
  }

  all (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async <
      Select extends {
        [alias: string]: string | RawSQL | Column
      } = typeof table0['c']
    >(
      qCond: Record<string, any>,
      select: Select | '*',
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      return (await this._find(table0, ...tables)(qCond, select, options)).all()
    }
  }

  count (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async (qCond: Record<string, any>): Promise<number> => {
      return (await this.first(table0, ...tables)(qCond, {
        count: sql`COUNT (*)`,
      }) || {}).count || 0
    }
  }

  first (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async <
      Select extends {
        [alias: string]: string | RawSQL | Column
      } = typeof table0['c']
    >(
      qCond: Record<string, any>,
      select: Select | '*',
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
      } = {},
    ) => {
      return (await (await this._find(table0, ...tables)(qCond, select, {
        ...options,
        limit: 1,
      })).all())[0]
    }
  }

  update (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async (
      qCond: Record<string, any>,
      set: Record<string, any> | {
        table: Table<any>
        set: Record<string, any>
      }[],
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      await Promise.all((await this._findIds(table0, ...tables)(qCond, options)).map(async ({
        sql: { stmt, params },
        table,
      }) => {
        if (Array.isArray(set)) {
          await Promise.all(set.filter((s) => s.table === table).map(async (s) => {
            await table.__updateBySql(this.sql)(stmt, params, s.set)
          }))
        } else {
          await table.__updateBySql(this.sql)(stmt, params, set)
        }
      }))
    }
  }

  delete (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async (
      qCond: Record<string, any>,
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      await Promise.all((await this._findIds(table0, ...tables)(qCond, options)).map(async ({
        sql: { stmt, params },
        table,
      }) => {
        await table.__deleteBySql(this.sql)(stmt, params)
      }))
    }
  }

  async close () {
    return new Promise<void>((resolve, reject) => {
      this.sql.close((err) => err ? reject(err) : resolve())
    })
  }

  private _find (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async <
      Select extends {
        [alias: string]: string | RawSQL | Column
      } = typeof table0['c'],
      R = UndefinedEqNull<{
        [K in keyof Select]: Select[K] extends Column<infer T> ? T : any
      }>
    >(
      qCond: Record<string, any>,
      select: Select | '*',
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ): Promise<{
      sql: {
        stmt: string
        params: SQLParams
      }
      each: (cb: (result: R) => void) => Promise<number>
      all: () => Promise<R[]>
    }> => {
      const tablesArray = tables.map((t) => t instanceof Table ? { to: t } : t)

      await this.emit('pre-find', {
        cond: qCond,
        select: select === '*' ? table0.c : select,
        tables: tablesArray,
        options,
      })

      const selectDict = Object.entries(
        select === '*' ? table0.c : select,
      ).map(([alias, col]) => {
        const key = col instanceof Column
          ? safeColumnName(`${col.tableName}.${col.name}`)
          : col instanceof RawSQL
            ? col.content : safeColumnName(col)
        return [alias, {
          key,
          column: col instanceof Column ? col : undefined,
        }]
      }).reduce((prev, [a, k]: any[]) => ({ ...prev, [a]: k }), {} as Record<string, {
        key: string
        column?: Column
      }>)

      const tableRecord: Record<string, Table<any>> = [
        table0,
        ...tables.map((t) => t instanceof Table
          ? t
          : t.to instanceof Table ? t.to : t.to.opts.table),
      ].reduce((prev, t) => ({ ...prev, [t.m.__meta.name]: t }), {})

      const postfix = options.postfix ? [options.postfix] : []
      if (options.sort) {
        postfix.push(`ORDER BY ${safeColumnName(
          typeof options.sort.key === 'string' ? options.sort.key : `${options.sort.key.tableName}.${options.sort.key.name}`,
        )} ${options.sort.desc ? 'DESC' : 'ASC'}`)
      }
      if (options.limit) {
        postfix.push(`LIMIT ${options.limit}`)
      }
      if (options.offset) {
        postfix.push(`OFFSET ${options.offset}`)
      }

      const params = new SQLParams()
      const stmt = [
        `SELECT ${selectDict ? Object.entries(selectDict).map(([a, k]) => {
          return k.key === a ? k.key : `${k.key} AS ${safeColumnName(a)}`
        }).join(',') : select}`,
        `FROM ${safeColumnName(table0.m.__meta.name)}`,
        ...tablesArray.map((t) => {
          const toTable = t.to instanceof Table ? t.to : t.to.opts.table

          if (t.from) {
            return [
              `${t.type || 'INNER'} JOIN ${safeColumnName(toTable.m.__meta.name)}`,
              'ON',
              safeColumnName(`${t.from.tableName}.${t.from.name}`),
              '=',
              safeColumnName(t.to instanceof Table
                ? `${toTable.m.__meta.name}.${toTable.primaryKey}`
                : `${toTable.m.__meta.name}.${t.to.name}`),
            ].join(' ')
          } else if (t.cond) {
            return [
              `${t.type || 'INNER'} JOIN ${safeColumnName(toTable.m.__meta.name)}`,
              'ON',
              `(${t.cond})`,
            ].join(' ')
          } else {
            return `${t.type || 'NATURAL'} JOIN ${safeColumnName(toTable.m.__meta.name)}`
          }
        }),
        `WHERE ${parseCond(qCond, tableRecord, params)}`,
        ...postfix,
      ].join(' ')

      await this.emit('find-sql', { stmt, params })

      const parseNative = (r: Record<string, any>) => {
        Object.entries(r).map(([alias, v]) => {
          if (selectDict && selectDict[alias] && selectDict[alias].column) {
            const col = selectDict[alias].column!
            r[alias] = col.opts.table.transform(col.name, 'get')(v)
          }
        })
        return r
      }

      return {
        sql: {
          stmt,
          params,
        },
        each: (cb) => {
          return new Promise((resolve, reject) => {
            this.sql.each(stmt, params.data, (err, r) => {
              err ? reject(err) : cb(parseNative(r) as any)
            }, (err, completion) => {
              err ? reject(err) : resolve(completion)
            })
          })
        },
        all: async () => {
          return new Promise((resolve, reject) => {
            this.sql.all(stmt, params.data, (err: any, data: any[]) => {
              err ? reject(err) : resolve(data.map((r) => parseNative(r) as any))
            })
          })
        },
      }
    }
  }

  private _findIds (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async (
      qCond: Record<string, any>,
      options: {
        postfix?: string
        sort?: {
          key: Column | string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      const tt = [
        table0,
        ...tables.map((t) => t instanceof Table
          ? t
          : t.to instanceof Table
            ? t.to : t.to.opts.table),
      ]

      return Promise.all(tt.map(async (t) => {
        return {
          sql: (await this._find(table0, ...tables)(qCond, {
            [`${t.m.__meta.name}__id`]: new Column({
              name: t.primaryKey,
              table: t,
              prop: t.m.__meta.primary,
            }),
          }, options)).sql,
          table: t,
        }
      }))
    }
  }
}

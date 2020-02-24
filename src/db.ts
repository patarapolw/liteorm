import 'bluebird-global'
import sqlite from 'sqlite'
import Emittery from 'emittery'
import { SQLStatement } from 'sql-template-strings'

import { Table, Column, UndefinedEqNull } from './table'
import { parseCond } from './find'
import { safeColumnName } from './utils'
import { SQL, joinSQL } from './compat/sql-template-strings'

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
      [alias: string]: string | SQLStatement | Column
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
  'find-sql': SQLStatement
}> {
  static async connect (f: string | sqlite.Database, options?: any) {
    const sql = typeof f === 'string' ? await sqlite.open(f, options) : f
    return new Db({ sql })
  }

  sql: sqlite.Database

  private constructor (params: any) {
    super()
    this.sql = params.sql
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

  find (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    cond?: string
    to: Column | Table<any>
  })[]) {
    return async <
      Select extends {
        [alias: string]: string | SQLStatement | Column
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
      sql: SQLStatement
      first: () => Promise<R>
      each: (cb: (result: R) => void) => Promise<number>
      all: () => Promise<R[]>
    }> => {
      const tablesArray = tables.map((t) => t instanceof Table ? { to: t } : t)

      await this.emit('pre-find', {
        cond: qCond,
        select: select === '*' ? table0.c : select,
        tables: tablesArray,
        options: options || {},
      })

      const selectDict = Object.entries(
        select === '*' ? table0.c : select,
      ).map(([alias, col]) => {
        const key = col instanceof Column
          ? safeColumnName(`${col.tableName}.${col.name}`)
          : col instanceof SQLStatement
            ? col.text : safeColumnName(col)
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

      const postfix = options.postfix ? [SQL(options.postfix)] : []
      if (options.sort) {
        postfix.push(SQL`ORDER BY ${SQL(safeColumnName(
          typeof options.sort.key === 'string' ? options.sort.key : `${options.sort.key.tableName}.${options.sort.key.name}`,
        ))} ${SQL(options.sort.desc ? 'DESC' : 'ASC')}`)
      }
      if (options.limit) {
        postfix.push(SQL(`LIMIT ${options.limit}`))
      }
      if (options.offset) {
        postfix.push(SQL(`OFFSET ${options.offset}`))
      }

      const sql = joinSQL([
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
        SQL`WHERE ${parseCond(qCond, tableRecord)}`,
        ...postfix,
      ], ' ')

      await this.emit('find-sql', sql)

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
        sql,
        first: async () => parseNative(await this.sql.get(sql)) as any,
        each: (cb) => {
          return new Promise((resolve, reject) => {
            this.sql.each(sql, (err, r) => {
              if (err) {
                reject(err)
              }
              // eslint-disable-next-line standard/no-callback-literal
              cb(parseNative(r) as any)
            }).then((n) => resolve(n))
          })
        },
        all: async () => (await this.sql.all(sql)).map((r) => parseNative(r)) as any[],
      }
    }
  }

  findIds (table0: Table<any>, ...tables: (Table<any> | {
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
          sql: (await this.find(table0, ...tables)(qCond, {
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
      await Promise.all((await this.findIds(table0, ...tables)(qCond, options)).map(async ({ sql, table }) => {
        if (Array.isArray(set)) {
          await Promise.all(set.filter((s) => s.table === table).map(async (s) => {
            await table.__updateBySql(this.sql)(sql, s.set)
          }))
        } else {
          await table.__updateBySql(this.sql)(sql, set)
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
      await Promise.all((await this.findIds(table0, ...tables)(qCond, options)).map(async ({ sql, table }) => {
        await table.__deleteBySql(this.sql)(sql)
      }))
    }
  }

  async close () {
    await this.sql.close()
    return this
  }
}

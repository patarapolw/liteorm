import 'bluebird-global'
import sqlite from 'sqlite'
import Emittery from 'emittery'

import { Table, ISql, Column, UndefinedEqNull } from './table'
import { parseCond } from './find'
import { safeColumnName, SafeIds, SqlFunction } from './utils'

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
      [alias: string]: string | SqlFunction | Column
    }
    options: {
      postfix?: string
      sort?: {
        key: Column
        desc?: boolean
      }
      offset?: number
      limit?: number
    }
  }
  'find-sql': ISql
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
    const bindings = new SafeIds()

    return async <
      SqlOnly extends boolean = false,
      Select extends {
        [alias: string]: string | SqlFunction | Column
      } = typeof table0['c'],
      R = SqlOnly extends true ? {
        sql: ISql
        bindings: SafeIds
      } : UndefinedEqNull<{
        [K in keyof Select]: Select[K] extends Column<infer T> ? T : any
      }>[],
    >(
      qCond: Record<string, any>,
      select: Select | '*',
      options: {
        postfix?: string
        sort?: {
          key: Column
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
      sqlOnly?: SqlOnly,
    ): Promise<R> => {
      const tablesArray = tables.map((t) => t instanceof Table ? { to: t } : t)

      await this.emit('pre-find', {
        cond: qCond,
        select: select === '*' ? table0.c : select,
        tables: tablesArray,
        options: options || {},
      })

      const selectDict = (select && typeof select === 'object')
        ? Object.entries(select).map(([alias, col]) => {
          const k = col instanceof Column ? `${col.tableName}.${col.name}` : col
          const a = alias || (col instanceof Column ? `${col.tableName}__${col.name}` : col)
          return [a, {
            key: k instanceof SqlFunction ? k.content : k,
            column: col instanceof Column ? col : undefined,
          }]
        }).reduce((prev, [a, k]: any[]) => ({ ...prev, [a]: k }), {} as Record<string, {
          key: string
          column?: Column
        }>)
        : null

      const tableRecord: Record<string, Table<any>> = [
        table0,
        ...tables.map((t) => t instanceof Table
          ? t
          : t.to instanceof Table ? t.to : t.to.opts.table),
      ].reduce((prev, t) => ({ ...prev, [t.m.__meta.name]: t }), {})

      const where = parseCond(qCond, tableRecord, bindings)

      const postfix = options.postfix ? [options.postfix] : []
      if (options.sort) {
        postfix.push(`ORDER BY ${safeColumnName(
          `${options.sort.key.tableName}.${options.sort.key.name}`,
        )} ${options.sort.desc ? 'DESC' : 'ASC'}`)
      }
      if (options.limit) {
        postfix.push(`LIMIT ${options.limit}`)
      }
      if (options.offset) {
        postfix.push(`OFFSET ${options.offset}`)
      }

      const sql = {
        $statement: [
          `SELECT ${selectDict ? Object.entries(selectDict).map(([a, k]) => {
            return k.key === a ? safeColumnName(k.key) : `${safeColumnName(k.key)} AS ${safeColumnName(a)}`
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
          `WHERE ${where.$statement}`,
          ...postfix,
        ].join(' '),
        $params: where.$params,
      }

      await this.emit('find-sql', sql)

      if (sqlOnly) {
        return { sql, bindings } as any
      }

      const rs = await this.sql.all(sql.$statement, sql.$params) as any[]
      rs.map((r) => {
        return Object.entries(r).map(([alias, v]) => {
          if (selectDict && selectDict[alias] && selectDict[alias].column) {
            const col = selectDict[alias].column!
            r[alias] = col.opts.table.transform(col.name, 'get')(v)
          }
        })
      })

      return rs as any
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
          key: Column
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
          ...(await this.find(table0, ...tables)(qCond, {
            [`${t.m.__meta.name}__id`]: new Column({
              name: t.primaryKey,
              table: t,
              prop: t.m.__meta.primary,
            }),
          }, options, true)),
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
          key: Column
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      await Promise.all((await this.findIds(table0, ...tables)(qCond, options)).map(async ({ sql, bindings, table }) => {
        if (Array.isArray(set)) {
          await Promise.all(set.filter((s) => s.table === table).map(async (s) => {
            await table.__updateBySql(this.sql)(sql, s.set, bindings)
          }))
        } else {
          await table.__updateBySql(this.sql)(sql, set, bindings)
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
          key: Column
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

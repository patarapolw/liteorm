import 'bluebird-global'
import sqlite from 'sqlite'
import Emittery from 'emittery'

import { Table, ISql, Column } from './table'
import { parseCond } from './find'
import { safeColumnName, SafeIds } from './utils'

export class Db extends Emittery.Typed<{
  'pre-find': {
    cond: any
    tables: {
      type?: 'inner' | 'left' | 'cross' | 'natural'
      from?: Column
      to: Column | Table<any>
    }[]
    select: {
      key: string | Column
      alias?: string
    }[]
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
    return table.__create(this.sql)
  }

  find (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    to: Column | Table<any>
  })[]) {
    const bindings = new SafeIds()

    return async <
      SqlOnly extends boolean = false,
      R = SqlOnly extends true ? {
        sql: ISql
        bindings: SafeIds
      } : Record<string, any>[]
    >(
      cond: Record<string, any>,
      select: (string | Column | {
        key: string | Column
        alias?: string
      })[],
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
      const selectArray = select.map((s) => (typeof s === 'string' || s instanceof Column) ? { key: s } : s)
      const tablesArray = tables.map((t) => t instanceof Table ? { to: t } : t)

      await this.emit('pre-find', {
        cond,
        select: selectArray,
        tables: tablesArray,
        options: options || {},
      })

      const selectDict = selectArray.map(({ key, alias }) => {
        const k = key instanceof Column ? `${key.tableName}.${key.columnName}` : key
        const a = alias || (key instanceof Column ? `${key.tableName}__${key.columnName}` : key)
        return [a, {
          key: k,
          column: key instanceof Column ? key : undefined,
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
      ].reduce((prev, t) => ({ ...prev, [t.__meta.name]: t }), {})

      const where = parseCond(cond, tableRecord, bindings)

      const postfix = options.postfix ? [options.postfix] : []
      if (options.sort) {
        postfix.push(`ORDER BY ${safeColumnName(
          `${options.sort.key.tableName}.${options.sort.key.columnName}`,
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
          `SELECT ${Object.entries(selectDict).map(([a, k]) => {
            return k.key === a ? safeColumnName(k.key) : `${safeColumnName(k.key)} AS ${safeColumnName(a)}`
          }).join(',')}`,
          `FROM ${safeColumnName(table0.__meta.name)}`,
          ...tablesArray.map((t) => {
            const toTable = t.to instanceof Table ? t.to : t.to.opts.table

            if (t.from) {
              return [
                `${t.type || 'INNER'} JOIN ${safeColumnName(toTable.__meta.name)}`,
                'ON',
                safeColumnName(`${t.from.tableName}.${t.from.columnName}`),
                '=',
                safeColumnName(t.to instanceof Table
                  ? `${toTable.__meta.name}.${toTable.__primaryKey}`
                  : `${toTable.__meta.name}.${t.to.columnName}`),
              ].join(' ')
            } else {
              return `${t.type || 'NATURAL'} JOIN ${safeColumnName(toTable.__meta.name)}`
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
          if (selectDict[alias] && selectDict[alias].column) {
            const col = selectDict[alias].column!
            r[alias] = col.opts.table.__transform(col.columnName, 'get')(v)
          }
        })
      })

      return rs as any
    }
  }

  findIds (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    to: Column | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
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
        const select = {
          key: t.__primaryKey,
          alias: `${t.__meta.name}__$$id`,
        }
        return {
          ...(await this.find(table0, ...tables)(cond, [select], options, true)),
          table: t,
        }
      }))
    }
  }

  update (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: Column
    to: Column | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
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
      await Promise.all((await this.findIds(table0, ...tables)(cond, options)).map(async ({ sql, bindings, table }) => {
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
    to: Column | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
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
      await Promise.all((await this.findIds(table0, ...tables)(cond, options)).map(async ({ sql, table }) => {
        await table.__deleteBySql(this.sql)(sql)
      }))
    }
  }

  async close () {
    await this.sql.close()
    return this
  }
}

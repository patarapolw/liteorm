import 'bluebird-global'
import sqlite from 'sqlite'
import Emittery from 'emittery'

import { Table, ISql } from './table'
import { parseCond } from './find'
import { safeColumnName } from './utils'

interface ITableWithKey<T = any> {
  table: Table<T>
  key?: keyof T
}

export class Db extends Emittery.Typed<{
  'pre-find': {
    cond: any
    tables: {
      type?: 'inner' | 'left' | 'cross' | 'natural'
      from?: ITableWithKey<any>
      to: ITableWithKey<any> | Table<any>
    }[]
    select: {
      table?: Table<any>
      key: string
      alias?: string
    }[]
    options: {
      postfix?: string
      sort?: {
        table: Table<any>
        key: string
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
    from?: ITableWithKey<any>
    to: ITableWithKey<any> | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
      select: (string | {
        table?: Table<any>
        key: string
        alias?: string
      })[],
      options: {
        postfix?: string
        sort?: {
          table: Table<any>
          key: string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ): Promise<Record<string, any>[]> => {
      const selectArray = select.map((s) => typeof s === 'string' ? { key: s } : s)
      const tablesArray = tables.map((t) => t instanceof Table ? { to: t } : t)

      await this.emit('pre-find', {
        cond,
        select: selectArray,
        tables: tablesArray,
        options: options || {},
      })

      const selectDict = selectArray.map(({ table, key, alias }) => {
        const k = table ? `${table.__meta.name}.${key}` : key
        const v = alias || (table ? `${table.__meta.name}__${key}` : key)
        return [k, v]
      }).reduce((prev, [k, v]) => ({ ...prev, [k]: v }), {} as Record<string, string>)

      const tableRecord: Record<string, Table<any>> = [
        table0,
        ...tables.map((t) => t instanceof Table
          ? t
          : t.to instanceof Table ? t.to : t.to.table),
      ].reduce((prev, t) => ({ ...prev, [t.__meta.name]: t }), {})

      const where = parseCond(cond, tableRecord)

      const postfix = options.postfix ? [options.postfix] : []
      if (options.sort) {
        postfix.push(`ORDER BY ${safeColumnName(
          `${options.sort.table.__meta.name}.${options.sort.key}`,
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
          `SELECT ${Object.entries(selectDict).map(([k, v]) => {
            return k === v ? safeColumnName(k) : `${safeColumnName(k)} AS ${safeColumnName(v)}`
          }).join(',')}`,
          `FROM ${safeColumnName(table0.__meta.name)}`,
          ...tablesArray.map((t) => {
            const toTable = t.to instanceof Table ? t.to : t.to.table

            if (t.from) {
              return [
                `${t.type || 'INNER'} JOIN ${safeColumnName(toTable.__meta.name)}`,
                'ON',
                safeColumnName(`${t.from.table.__meta.name}.${t.from.key ? String(t.from.key) : t.from.table.__primaryKey}`),
                '=',
                safeColumnName(typeof t.from === 'string'
                  ? t.from
                  : `${t.from.table.__meta.name}.${t.from.key ? String(t.from.key) : t.from.table.__primaryKey}`),
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

      return this.sql.all(sql.$statement, sql.$params)
    }
  }

  findIds (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: ITableWithKey<any>
    to: ITableWithKey<any> | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
      options: {
        postfix?: string
        sort?: {
          table: Table<any>
          key: string
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
            ? t.to : t.to.table),
      ]

      return (await this.find(table0, ...tables)(cond, tt.map((t) => {
        return {
          key: t.__primaryKey,
          alias: `${t.__meta.name}__id`,
        }
      }), options)).map((el) => {
        return Object.entries(el).map(([alias, id]) => ({
          table: tt.filter((t) => `${t.__meta.name}__id` === alias)[0],
          id,
        }))
      })
    }
  }

  update (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: ITableWithKey<any>
    to: ITableWithKey<any> | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
      set: any,
      options: {
        postfix?: string
        sort?: {
          table: Table<any>
          key: string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      return Promise.all((await this.findIds(table0, ...tables)(cond, options)).map((el) => {
        return Promise.all(el.map((t) => {
          return t.table.__updateById(this.sql)(t.id, set)
        }))
      }))
    }
  }

  delete (table0: Table<any>, ...tables: (Table<any> | {
    type?: 'inner' | 'left' | 'cross' | 'natural'
    from?: ITableWithKey<any>
    to: ITableWithKey<any> | Table<any>
  })[]) {
    return async (
      cond: Record<string, any>,
      options: {
        postfix?: string
        sort?: {
          table: Table<any>
          key: string
          desc?: boolean
        }
        offset?: number
        limit?: number
      } = {},
    ) => {
      return Promise.all((await this.findIds(table0, ...tables)(cond, options)).map((el) => {
        return Promise.all(el.map((t) => {
          return t.table.__deleteById(this.sql)(t.id)
        }))
      }))
    }
  }

  async close () {
    await this.sql.close()
    return this
  }
}

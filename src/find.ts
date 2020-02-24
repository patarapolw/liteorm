import { SQLStatement } from 'sql-template-strings'

import { Table } from './table'
import { safeColumnName } from './utils'
import { IPropRow } from './decorators'
import { joinSQL, SQL } from './compat/sql-template-strings'

/**
 *
 * @param q
 * @param cols
 */
export function parseCond (
  q: Record<string, any>,
  cols: Record<string, Table<any>>,
): SQLStatement {
  const subClause: SQLStatement[] = []

  if (Array.isArray(q.$or)) {
    subClause.push(SQL`(${
      joinSQL(q.$or.map((el) => parseCond(el, cols)), ' OR ')
    })`)
  } else if (Array.isArray(q.$and)) {
    subClause.push(SQL`(${
      joinSQL(q.$and.map((el) => parseCond(el, cols)), ' AND ')
    })`)
  } else {
    subClause.push(SQL`(${
      _parseCondBasic(q, cols)
    })`)
  }

  if (subClause.length > 1) {
    return SQL`(${joinSQL(subClause, ' AND ')})`
  } else if (subClause.length === 1) {
    return subClause[0]
  }
  return SQL`TRUE`
}

function _parseCondBasic (
  cond: Record<string, any>,
  cols: Record<string, Table<any>>,
): SQLStatement {
  const cList: SQLStatement[] = []

  function doDefault (k: string, v: any) {
    if (strArrayCols.includes(k)) {
      cList.push(SQL`${SQL(k)} LIKE '%\x1f'||${v}||'\x1f%'`)
    } else {
      cList.push(SQL`${SQL(k)} = ${v}`)
    }
  }

  const strArrayCols = Object.values(cols).map((c) => {
    const strArrayFields = Object.entries<IPropRow>(c.m.__meta.prop)
      .filter(([_, v]) => v && v.type === 'StringArray')
      .map(([k]) => k)
    return [
      ...strArrayFields.map((f) => safeColumnName(f)),
      ...strArrayFields.map((f) => `${c.m.__meta.name}__${f}`),
    ]
  }).reduce((prev, c) => [...prev, ...c], [])

  for (let [k, v] of Object.entries(cond)) {
    let isPushed = false
    if (k.includes('.')) {
      const kn = k.split('.')
      k = `json_extract(${safeColumnName(kn[0])}, '$.${safeColumnName(kn.slice(1).join('.'))}')`
    } else {
      k = safeColumnName(k)
    }
    const isStrArray = strArrayCols.includes(k)

    if (v instanceof Date) {
      v = +v
    }

    if (v) {
      if (Array.isArray(v)) {
        if (isStrArray) {
          cList.push(SQL`(${joinSQL((v.map((v0) => {
            return SQL`${SQL(k)} LIKE '%\x1f'||${v0}||'\x1f%'`
          })), ' AND ')})`)
        } else {
          if (v.length > 1) {
            cList.push(SQL`${SQL(k)} IN (${joinSQL(v.map((v0) => SQL`${v0}`), ',')})`)
          } else if (v.length === 1) {
            cList.push(SQL`${SQL(k)} = ${v[0]}`)
          }
        }
      } else if (typeof v === 'object' && v.constructor === Object) {
        const op = Object.keys(v)[0]
        let v1 = v[op]
        if (v1 instanceof Date) {
          v1 = +v1
        }

        if (Array.isArray(v1)) {
          switch (op) {
            case '$in':
              if (isStrArray) {
                cList.push(SQL`(${joinSQL(v1.map((v0) => {
                  return SQL`${SQL(k)} LIKE '%\x1f'||${v0}||'\x1f%'`
                }), ' OR ')})`)
              } else {
                if (v1.length > 1) {
                  cList.push(SQL`${SQL(k)} IN (${joinSQL(v1.map((v0) => SQL`${v0}`), ',')})`)
                } else if (v1.length === 1) {
                  cList.push(SQL`${SQL(k)} = ${v1[0]}`)
                }
              }
              isPushed = true
              break
            case '$nin':
              if (v1.length > 1) {
                cList.push(SQL`${SQL(k)} NOT IN (${joinSQL(v1.map((v0) => SQL`${v0}`), ',')})`)
              } else {
                cList.push(SQL`${SQL(k)} != ${v1[0]}`)
              }
              isPushed = true
              break
          }
        }

        if (isPushed) {
          continue
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
            cList.push(SQL`${SQL(k)} LIKE ${v1}`)
            break
          case '$nlike':
            cList.push(SQL`${SQL(k)} NOT LIKE ${v1}`)
            break
          case '$substr':
            cList.push(SQL`${SQL(k)} LIKE '%'||${v1}||'%'`)
            break
          case '$nsubstr':
            cList.push(SQL`${SQL(k)} NOT LIKE '%'||${v1}||'%'`)
            break
          case '$exists':
            cList.push(SQL`${SQL(k)} IS ${SQL(v1 ? 'NOT NULL' : 'NULL')}`)
            break
          case '$gt':
            cList.push(SQL`${SQL(k)} > ${v1}`)
            break
          case '$gte':
            cList.push(SQL`${SQL(k)} >= ${v1}`)
            break
          case '$lt':
            cList.push(SQL`${SQL(k)} < ${v1}`)
            break
          case '$lte':
            cList.push(SQL`${SQL(k)} <= ${v1}`)
            break
          case '$ne':
            cList.push(SQL`${SQL(k)} != ${v1}`)
            break
          default:
            doDefault(k, v)
        }
      } else {
        doDefault(k, v)
      }
    } else {
      doDefault(k, v)
    }
  }

  if (cList.length > 1) {
    return SQL`(${joinSQL(cList, ' AND ')})`
  } else if (cList.length === 1) {
    return cList[0]
  }
  return SQL`TRUE`
}

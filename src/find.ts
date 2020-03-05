import { Table } from './table'
import { safeColumnName, SQLParams } from './utils'
import { IPropRow } from './decorators'

/**
 *
 * @param q
 * @param cols
 */
export function parseCond (
  q: Record<string, any>,
  cols: Record<string, Table<any>>,
  params: SQLParams,
): string {
  const subClause: string[] = []

  if (Array.isArray(q.$or)) {
    subClause.push(q.$or.map((el) => parseCond(el, cols, params)).join(' OR '))
  } else if (Array.isArray(q.$and)) {
    subClause.push(q.$and.map((el) => parseCond(el, cols, params)).join(' AND '))
  } else {
    subClause.push(_parseCondBasic(q, cols, params))
  }

  if (subClause.length > 0) {
    return subClause.join(' AND ')
  }

  return 'TRUE'
}

function _parseCondBasic (
  cond: Record<string, any>,
  cols: Record<string, Table<any>>,
  params: SQLParams,
): string {
  const cList: string[] = []

  function doDefault (k: string, v: any) {
    const vParam = params.add(v)

    /**
     * Already a safen column name
     */
    if (strArrayCols.includes(k)) {
      cList.push(`${k} LIKE '%\x1f'||${vParam}||'\x1f%'`)
    } else {
      cList.push(`${k} = ${vParam}`)
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
          cList.push(v.map((v0) => {
            const vParam = params.add(v0)
            return `${k} LIKE '%\x1f'||${vParam}||'\x1f%'`
          }).join(' AND '))
        } else {
          if (v.length > 1) {
            cList.push(`${k} IN (${v.map((v0) => `${params.add(v0)}`).join(',')})`)
          } else if (v.length === 1) {
            cList.push(`${k} = ${params.add(v[0])}`)
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
                cList.push(v1.map((v0) => {
                  return `${k} LIKE '%\x1f'||${params.add(v0)}||'\x1f%'`
                }).join(' OR '))
              } else {
                if (v1.length > 1) {
                  cList.push(`${k} IN (${v1.map((v0) => params.add(v0)).join(',')})`)
                } else if (v1.length === 1) {
                  cList.push(`${k} = ${params.add(v1[0])}`)
                }
              }
              isPushed = true
              break
            case '$nin':
              if (v1.length > 1) {
                cList.push(`${k} NOT IN (${v1.map((v0) => params.add(v0)).join(',')})`)
              } else {
                cList.push(`${k} != ${params.add(v1[0])}`)
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
            cList.push(`${k} LIKE ${params.add(v1)}`)
            break
          case '$nlike':
            cList.push(`${k} NOT LIKE ${params.add(v1)}`)
            break
          case '$substr':
            cList.push(`${k} LIKE '%'||${params.add(v1)}||'%'`)
            break
          case '$nsubstr':
            cList.push(`${k} NOT LIKE '%'||${params.add(v1)}||'%'`)
            break
          case '$exists':
            cList.push(`${k} IS ${v1 ? 'NOT NULL' : 'NULL'}`)
            break
          case '$gt':
            cList.push(`${k} > ${params.add(v1)}`)
            break
          case '$gte':
            cList.push(`${k} >= ${params.add(v1)}`)
            break
          case '$lt':
            cList.push(`${k} < ${params.add(v1)}`)
            break
          case '$lte':
            cList.push(`${k} <= ${params.add(v1)}`)
            break
          case '$ne':
            cList.push(`${k} != ${params.add(v1)}`)
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

  if (cList.length > 0) {
    return cList.join(' AND ')
  }
  return 'TRUE'
}

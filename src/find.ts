import { Table, ISql } from './table'
import { safeColumnName, SafeIds } from './utils'

/**
 *
 * @param q
 * @param cols
 * @param getFreeBinding Can be generated via '@/utils#SafeIds'
 */
export function parseCond (
  q: Record<string, any>,
  cols: Record<string, Table<any>>,
  safeIds: SafeIds,
): ISql {
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
      const r = parseCond(el, cols, safeIds)
      Object.assign($params, r.$params)

      return r.$statement
    }).join(' OR ')

    subClause.push(`(${c})`)
  } else if (Array.isArray(q.$and)) {
    const c = q.$and.map((el) => {
      const r = parseCond(el, cols, safeIds)
      Object.assign($params, r.$params)

      return r.$statement
    }).join(' AND ')

    subClause.push(`(${c})`)
  } else {
    const r = _parseCondBasic(q, cols, safeIds)

    subClause.push(`(${r.$statement})`)
    Object.assign($params, r.$params)
  }

  return {
    $statement: subClause.join(' AND ') || 'TRUE',
    $params,
  }
}

function _parseCondBasic (
  cond: Record<string, any>,
  cols: Record<string, Table<any>>,
  safeIds: SafeIds,
): ISql {
  if (cond.$statement) {
    return {
      $statement: cond.$statement,
      $params: cond.$params || [],
    }
  }

  const cList: string[] = []
  const $params: Record<string, any> = {}

  function doDefault (k: string, v: any, id: string) {
    if (strArrayCols.includes(k)) {
      Object.assign($params, { [id]: v })
      cList.push(`${k} LIKE '%\x1f'||${id}||'\x1f%'`)
    } else {
      Object.assign($params, { [id]: v })
      cList.push(`${k} = ${id}`)
    }
  }

  const strArrayCols = Object.values(cols).map((c) => {
    const strArrayFields = Object.entries(c.__meta.prop)
      .filter(([_, v]) => v && v.type === 'StringArray')
      .map(([k]) => k)
    return [
      ...strArrayFields.map((f) => safeColumnName(f)),
      ...strArrayFields.map((f) => `${c.__meta.name}__${f}`),
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
          cList.push(`(${(v.map((v0) => {
            const id = safeIds.pop()
            Object.assign($params, { [id]: v0 })
            return `${k} LIKE '%\x1f'||${id}||'\x1f%'`
          })).join(' AND ')})`)
        } else {
          if (v.length > 1) {
            const vObj = v.reduce((prev, c) => ({ ...prev, [safeIds.pop()]: c }), {})
            cList.push(`${k} IN (${Object.keys(vObj).join(',')})`)
            Object.assign($params, vObj)
          } else if (v.length === 1) {
            const id = safeIds.pop()
            cList.push(`${k} = ${id}`)
            Object.assign($params, { [id]: v[0] })
          }
        }
      } else if (typeof v === 'object' && v.toString() === '[object Object]') {
        const op = Object.keys(v)[0]
        let v1 = v[op]
        if (v1 instanceof Date) {
          v1 = +v1
        }

        if (Array.isArray(v1)) {
          switch (op) {
            case '$in':
              if (isStrArray) {
                cList.push(`(${(v1.map((v0) => {
                  const id = safeIds.pop()
                  Object.assign($params, { [id]: v0 })
                  return `${k} LIKE '%\x1f'||${id}||'\x1f%'`
                })).join(' OR ')})`)
              } else {
                if (v1.length > 1) {
                  const vObj = v1.reduce((prev, c) => ({ ...prev, [safeIds.pop()]: c }), {})
                  cList.push(`${k} IN (${Object.keys(vObj).join(',')})`)
                  Object.assign($params, vObj)
                } else if (v1.length === 1) {
                  const id = safeIds.pop()
                  cList.push(`${k} = ${id}`)
                  Object.assign($params, { [id]: v1[0] })
                }
              }
              isPushed = true
              break
            case '$nin':
              if (v1.length > 1) {
                const vObj = v1.reduce((prev, c) => ({ ...prev, [safeIds.pop()]: c }), {})
                cList.push(`${k} NOT IN (${Object.keys(vObj).join(',')})`)
                Object.assign($params, vObj)
              } else {
                const id = safeIds.pop()
                cList.push(`${k} != ${id}`)
                Object.assign($params, { [id]: v1[0] })
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

        const id = safeIds.pop()
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
            doDefault(k, v, id)
        }
      } else {
        const id = safeIds.pop()
        doDefault(k, v, id)
      }
    } else {
      const id = safeIds.pop()
      doDefault(k, v, id)
    }
  }

  return {
    $statement: cList.join(' AND ') || 'TRUE',
    $params,
  }
}

import { SQLStatement, SQL as _SQL } from 'sql-template-strings'

export function SQL (ss?: TemplateStringsArray | string | SQLStatement, ...args: any[]): SQLStatement {
  if (typeof ss === 'string') {
    return _SQL``.append(ss)
  } else if (ss instanceof SQLStatement) {
    return ss
  }

  const sql = _SQL``

  if (ss) {
    ss.map((s, i) => {
      const u = args[i]
      if (u === undefined) {
        sql.append(s)
      } else if (u instanceof SQLStatement) {
        sql.append(s).append(u)
      } else {
        sql.append(s).append(_SQL`${u}`)
      }
    })
  }

  return sql
}

export function joinSQL (sqls: (SQLStatement | string)[], separator: string) {
  return sqls.slice(1).reduce((prev, c) => SQL(prev).append(SQL(separator)).append(c), SQL(sqls[0])) as SQLStatement
}

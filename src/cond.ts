import uuid4 from "uuid/v4";
import moment from "moment";

function parseCondBasic(cond: Record<string, any>): { clause: string, params: any[] } {
  const cList: string[] = [];
  const params: any[] = [];

  for (let [k, v] of Object.entries(cond)) {
    if (k.includes(".")) {
      const kn = k.split(".");
      k = `json_extract("${kn[0]}", '$.${kn.slice(1).join(".")}')`;
    } else {
      k = `"${k}"`;
    }

    if (v && (v.constructor === {}.constructor || Array.isArray(v))) {
      const v0 = Object.keys(v)[0];
      const v1 = v[v0];
      switch (v0) {
        case "$like":
          cList.push(`${k} LIKE ?`);
          params.push(v1);
          break;
        case "$nlike":
          cList.push(`${k} NOT LIKE ?`);
          params.push(v1);
          break;
        case "$substr":
          cList.push(`${k} LIKE ?`);
          params.push(`%${JSON.stringify(v1).replace(/[%_[]/g, "[$&]")}%`);
          break;
        case "$nsubstr":
          cList.push(`${k} NOT LIKE ?`);
          params.push(`%${JSON.stringify(v1).replace(/[%_[]/g, "[$&]")}%`);
          break;
        case "$exists":
          cList.push(`${k} IS ${v1 ? "NOT NULL" : "NULL"}`);
          break;
        case "$in":
          if (v1.length > 1) {
            cList.push(`${k} IN (${v1.map((_: any) => "?").join(",")})`)
            params.push(...v1);
          } else {
            cList.push(`${k} = ?`);
            params.push(v1[0]);
          }
          break;
        case "$nin":
          if (v1.length > 1) {
            cList.push(`${k} NOT IN (${v1.map((_: any) => "?").join(",")})`)
            params.push(...v1);
          } else {
            cList.push(`${k} != ?`);
            params.push(v1[0]);
          }
          break;
        case "$gt":
          cList.push(`${k} > ?`);
          params.push(v1);
          break;
        case "$gte":
          cList.push(`${k} >= ?`);
          params.push(v1);
          break;
        case "$lt":
          cList.push(`${k} < ?`);
          params.push(v1);
          break;
        case "$lte":
          cList.push(`${k} <= ?`);
          params.push(v1);
          break;
        case "$ne":
          cList.push(`${k} != ?`);
          params.push(v);
        default:
          cList.push(`${k} = ?`);
          params.push(v);
      }
    } else {
      cList.push(`${k} = ?`);
      params.push(v);
    }
  }

  return {
    clause: cList.join(" AND ") || "TRUE",
    params
  };
}

function qToCond(q: string): Record<string, any> {
  const result: Record<string, any> = {};
  const tokenMap: Record<string, string> = {};
  let isInBrackets = false;
  let token: string[] = [];

  q.split("").forEach((c, i) => {
    if (isInBrackets) {
      if (c === ")" && q[i - 1] !== "\\") {
        isInBrackets = false;

        if (token.length > 0) {
          const t = token.join("");
          const replacement = uuid4();
          q = q.replace(t, replacement);
          tokenMap[replacement] = t;
        }
      } else {
        token.push(c);
      }
    } else {
      if (c === "(" && q[i - 1] !== "\\") {
        isInBrackets = true;
      }
    }
  });

  const $or = q.split(" OR ").map((el) => qToCond(el));
  if ($or.length > 1) {
    return {$or};
  }

  let m: RegExpExecArray | null;
  while(m = /(-)?([\w.]+)(=|!=|>=?|<=?|~|:)(\S+|"[^"]*")/g.exec(q)) {
    let [all, neg, k, op, v]: any[] = m;
    if (v[0] === '"' && v[v.length - 1] === '"') {
      v = v.slice(1, v.length - 1)
    } else {
      if (/^\d+(?:\.\d+)?$/.test(v)) {
        v = parseFloat(v);
      } else if (v === "NULL") {
        result[k] = {$exists: !neg}
        continue;
      } else {
        const m1 = /^((?:[+\-])\d+(?:\.\d+)?)(\w+)$/.exec(v);
        if (m1) {
          const d = moment.duration(parseFloat(m[1]), m[2] as any);
          if (d.isValid()) {
            v = moment().add(d).toISOString();
          }
        } else {
          const d = moment(v);
          if (d.isValid()) {
            v = d.toISOString();
          }
        }
      }
    }

    if (neg) {
      switch(op) {
        case "=": op = "!="; break;
        case "!=": op = "="; break;
        case ">": op = "<="; break;
        case ">=": op = "<"; break;
        case "<": op = ">="; break;
        case "<=": op = ">"; break;
        case "~": op = "nlike"; break;
        default:
          if (typeof v === "string") {
            op = "nsubstr";
          } else {
            op = "!=";
          }
      }
    }

    switch(op) {
      case "=": result[k] = v; break;
      case "!=": result[k] = {$ne: v}; break;
      case ">": result[k] = {$gt: v}; break;
      case ">=": result[k] = {$gte: v}; break;
      case "<": result[k] = {$lt: v}; break;
      case "<=": result[k] = {$lte: v}; break;
      case "~": result[k] = {$like: v}; break;
      case "nlike": result[k] = {$nlike: v}; break;
      case "nsubstr": result[k] = {$nsubstr: v}; break;
      default: result[k] = {$substr: v};
    }
  }

  return result;
}

export default function parseCond(q: string | Record<string, any>): { clause: string, params: any[] } {
  let subClause: string[] = [];
  const params: any[] = [];

  if (typeof q === "string") {
    q = qToCond(q);
  }

  if (Array.isArray(q.$or)) {
    const c = q.$or.map((el) => {
      const r = parseCond(el);
      params.push(...r.params);

      return r.clause;
    }).join(" OR ");

    subClause.push(`(${c})`);
  } else if (Array.isArray(q.$and)) {
    const c = q.$and.map((el) => {
      const r = parseCond(el);
      params.push(...r.params);

      return r.clause;
    }).join(" AND ");

    subClause.push(`(${c})`);
  } else {
    const r = parseCondBasic(q);

    subClause.push(`(${r.clause})`);
    params.push(...r.params);
  }

  return {
    clause: subClause.join(" AND ") || "TRUE",
    params
  };
}
import sqlite from "sqlite";
import "./types";
import AsyncEventEmitter from "async-eventemitter";

export type SqliteNative = "string" | "integer" | "float" | "binary";
export type SqliteExt = "datetime" | "JSON";

interface ITransformer<T> {
  get: (repr: string | null) => T | null;
  set: (data: T) => string | null;
}

interface ISql {
  statement: string;
  params: any[];
}

export interface IPrimaryRow {
  name: string | string[];
  type?: SqliteNative;
  autoincrement?: boolean;
}

export interface IPropRow {
  type: SqliteNative | SqliteExt,
  unique?: boolean;
  null?: boolean;
  references?: string;
  default?: any;
}

export class Collection<T> extends AsyncEventEmitter<{
  "build": (data: ISql, callback?: () => void) => void,
  "pre-create": (data: {entry: T, ignoreErrors: boolean}, callback?: () => void) => void,
  "create": (data: ISql, callback?: () => void) => void,
  "pre-find": (data: {
    cond: Partial<Record<keyof T, any>>;
    fields?: Array<keyof T> | null;
    postfix?: string;
  }, callback?: () => void) => void,
  "find": (data: ISql, callback?: () => void) => void,
  "pre-update": (data: {
    cond: Partial<Record<keyof T, any>>;
    set: Partial<Record<keyof T, any>>;
  }, callback?: () => void) => void,
  "update": (data: ISql, callback?: () => void) => void,
  "pre-delete": (data: {
    cond: Partial<Record<keyof T, any>>
  }, callback?: () => void) => void,
  "delete": (data: ISql, callback?: () => void) => void
}> {
  public __meta: {
    db: sqlite.Database;
    name: string;
    primary: IPrimaryRow;
    prop: Partial<Record<keyof T, IPropRow>>;
    unique?: string[][];
    transform: Record<SqliteExt, ITransformer<any>>;
  };

  constructor(
    db: sqlite.Database,
    model: T
  ) {
    super();

    const { name, primary, unique, prop } = (model as any).__meta;

    this.__meta = {
      db,
      name,
      primary,
      prop,
      unique,
      transform: {
        datetime: {
          get: (repr) => repr ? new Date(repr) : null,
          set: (data) => data ? data.toISOString() : null
        },
        JSON: {
          get: (repr) => repr ? JSON.parse(repr) : null,
          set: (data) => data ? JSON.stringify(data) : null
        }
      }
    }
  }

  public async build() {
    const typeMap: Record<SqliteNative | SqliteExt, string> = {
      string: "TEXT",
      integer: "INTEGER",
      float: "FLOAT",
      binary: "BLOB",
      datetime: "TEXT",
      JSON: "TEXT"
    }

    const col: string[] = [];

    if (this.__meta.primary.type) {
      col.push([
        `"${this.__meta.primary.name}"`,
        typeMap[this.__meta.primary.type] || "INTEGER",
        "PRIMARY KEY",
        this.__meta.primary.autoincrement ? "AUTOINCREMENT" : ""
      ].join(" "))
    }

    for (const [k, v] of Object.entries<IPropRow>(this.__meta.prop as any)) {
      if (v && v.type) {
        col.push([
          `"${k}"`,
          typeMap[v.type] || "INTEGER",
          v.unique ? "UNIQUE" : "",
          v.null ? "" : "NOT NULL",
          v.default ? (
            typeof v.default === "string" ? `'${v.default.replace("'", "[']")}'` : v.default
          ) : "",
          v.references ? `REFERENCES "${v.references}"` : ""
        ].join(" "));
      }
    }

    if (Array.isArray(this.__meta.primary.name)) {
      col.push([
        "PRIMARY KEY",
        `(${this.__meta.primary.name.join(",")})`
      ].join(" "));
    }

    if (this.__meta.unique && this.__meta.unique.length > 0) {
      this.__meta.unique.forEach((ss) => {
        col.push([
          "UNIQUE",
          `(${ss.join(",")})`
        ].join(" "))
      })
    }

    const sql: ISql = {
      statement: `CREATE TABLE IF NOT EXISTS "${this.__meta.name}" (${col.join(",")})`,
      params: []
    };

    await new Promise((resolve) => this.emit("build", sql, resolve));
    await this.__meta.db.exec(sql.statement);

    return this;
  }

  public async create(entry: T, ignoreErrors = false): Promise<number> {
    await new Promise((resolve) => this.emit("pre-create", {entry, ignoreErrors}, resolve));

    const bracketed: string[] = [];
    const values: string[] = [];

    for (let [k, v] of Object.entries(entry)) {
      const prop = (this.__meta.prop as any)[k];
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type];
        if (tr) {
          v = tr.set(v);
        }
      }

      bracketed.push(k);
      values.push(v);
    }

    const sql = {
      statement: `
      INSERT INTO "${this.__meta.name}" (${bracketed.map((el) => `"${el}"`).join(",")})
      VALUES (${values.map((_) => "?").join(",")})
      ${ignoreErrors ? "ON CONFLICT DO NOTHING" : ""}`,
      params: values
    };

    await new Promise((resolve) => this.emit("create", sql, resolve));
    const r = await this.__meta.db.run(sql.statement, ...sql.params);

    return r.lastID;
  }

  public async find(
    cond: Partial<Record<keyof T, any>>,
    fields?: Array<keyof T> | null,
    postfix?: string
  ): Promise<Partial<T>[]> {
    await new Promise((resolve) => this.emit("pre-find", {cond, fields, postfix}, resolve));

    const where = this.getWhere(cond);

    const selectClause: string[] = [];
    if (!fields) {
      selectClause.push("*");
    } else {
      fields.forEach((f) => {
        selectClause.push(`"${f}"`);
      })
    }

    const sql: ISql = {
      statement: `
      SELECT ${selectClause.join(",")}
      FROM "${this.__meta.name}"
      ${where ? `WHERE ${where.clause}` : ""} ${postfix || ""}`,
      params: where ? where.params.map((el) => el === undefined ? null : el) : []
    };

    await new Promise((resolve) => this.emit("find", sql, resolve));
    const r = (await this.__meta.db.all(sql.statement,
    ...sql.params)).map((el) => {
      for (const [k, v] of Object.entries(el)) {
        const prop = (this.__meta.prop as any)[k];
        if (prop && prop.type) {
          const tr = (this.__meta.transform as any)[prop.type];
          if (tr) {
            el[k] = tr.get(v);
          }
        }
      }

      return el;
    });

    return r;
  }

  public async get(
    cond: Partial<Record<keyof T, any>>,
    fields?: Array<keyof T> 
  ): Promise<Partial<T> | null> {
    return (await this.find(cond, fields, "LIMIT 1"))[0] || null;
  }

  public async update(
    cond: Partial<Record<keyof T, any>>,
    set: Partial<Record<keyof T, any>>,
  ) {
    await new Promise((resolve) => this.emit("pre-update", {cond, set}, resolve));

    const setK: string[] = [];
    const setV: any[] = [];
    const where = this.getWhere(cond);

    for (let [k, v] of Object.entries<any>(set)) {
      const { type } = (this.__meta.prop as any)[k];
      const tr = type ? (this.__meta.transform as any)[type] : undefined;
      if (tr) {
        v = tr.set(v);
      }

      setK.push(`"${k}" = ?`);
      setV.push(v);
    }

    const sql: ISql = {
      statement: `
      UPDATE "${this.__meta.name}"
      SET ${setK.join(",")}
      ${where ? `WHERE ${where.clause}` : ""}`,
      params: [
        ...setV,
        ...(where ? where.params.map((el) => el === undefined ? null : el) : [])
      ]
    }

    await new Promise((resolve) => this.emit("update", sql, resolve));
    await this.__meta.db.run(sql.statement,
      ...sql.params);
  }

  public async delete(
    cond: Partial<Record<keyof T, any>>
  ) {
    await new Promise((resolve) => this.emit("pre-delete", {cond}, resolve));

    const where = this.getWhere(cond);

    const sql: ISql = {
      statement: `
      DELETE FROM "${this.__meta.name}"
      ${where ? `WHERE ${where.clause}` : ""}`,
      params: (where ? where.params.map((el) => el === undefined ? null : el) : [])
    }

    await new Promise((resolve) => this.emit("delete", sql, resolve));
    await this.__meta.db.run(sql.statement,
      ...sql.params);
  }

  private getWhere(cond: Record<string, any>): { clause: string, params: any[] } | null {
    const cList: string[] = [];
    const params: any[] = [];

    for (let [k, v] of Object.entries(cond)) {
      if (v && (v.constructor === {}.constructor || Array.isArray(v))) {
        const v0 = Object.keys(v)[0];
        const v1 = v[v0];
        switch (v0) {
          case "$like":
            cList.push(`"${k}" LIKE ?`);
            params.push(v1);
            break;
          case "$exists":
            cList.push(`"${k}" IS ${v1 ? "NOT NULL" : "NULL"}`);
            break;
          case "$in":
            if (v1.length > 1) {
              cList.push(`"${k}" IN (${v1.map((_: any) => "?").join(",")})`)
              params.push(...v1);
            } else {
              cList.push(`"${k}" = ?`);
              params.push(v1[0]);
            }
            break;
          case "$gt":
            cList.push(`"${k}" > ?`);
            params.push(v1);
            break;
          case "$gte":
            cList.push(`"${k}" >= ?`);
            params.push(v1);
            break;
          case "$lt":
            cList.push(`"${k}" < ?`);
            params.push(v1);
            break;
          case "$lte":
            cList.push(`"${k}" <= ?`);
            params.push(v1);
            break;
          default:
            k += "JSON";
            v = JSON.stringify(v);
            cList.push(`"${k}" = ?`);
            params.push(v);
        }
      } else {
        cList.push(`"${k}" = ?`);
        params.push(v);
      }
    }

    return cList.length > 0 ? {
      clause: cList.join(" AND "),
      params
    } : null;
  }
}
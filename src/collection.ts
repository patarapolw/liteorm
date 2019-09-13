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
    primary: IPrimaryRow;
    prop: Partial<Record<keyof T, IPropRow>>;
    unique?: string[][];
    transform: Record<SqliteExt, ITransformer<any>>;
  };

  public db: sqlite.Database;
  public name: string;

  constructor(
    db: sqlite.Database,
    model: T
  ) {
    super();

    const { name, primary, unique, prop } = (model as any).__meta;

    this.db = db;
    this.name = name;

    this.__meta = {
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
        let def: any = undefined;
        if (v.default) {
          def = this.transformEntry({[k]: v.default} as any)[k];
        }

        col.push([
          `"${k}"`,
          typeMap[v.type] || "INTEGER",
          v.unique ? "UNIQUE" : "",
          v.null ? "" : "NOT NULL",
          def !== undefined ? (
            typeof def === "string" ? `DEFAULT '${def.replace("'", "[']")}'` : `DEFAULT ${def}`
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
      statement: `CREATE TABLE IF NOT EXISTS "${this.name}" (${col.join(",")})`,
      params: []
    };

    await new Promise((resolve) => this.emit("build", sql, resolve));
    await this.db.exec(sql.statement);

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
      INSERT INTO "${this.name}" (${bracketed.map((el) => `"${el}"`).join(",")})
      VALUES (${values.map((_) => "?").join(",")})
      ${ignoreErrors ? "ON CONFLICT DO NOTHING" : ""}`,
      params: values
    };

    await new Promise((resolve) => this.emit("create", sql, resolve));
    const r = await this.db.run(sql.statement, ...sql.params);

    return r.lastID;
  }

  public async find(
    cond: Partial<Record<keyof T, any>>,
    fields?: Array<keyof T> | null,
    postfix?: string
  ): Promise<Partial<T>[]> {
    await new Promise((resolve) => this.emit("pre-find", {cond, fields, postfix}, resolve));

    const where = condToWhere(cond);

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
      FROM "${this.name}"
      ${where ? `WHERE ${where.clause}` : ""} ${postfix || ""}`,
      params: where ? where.params.map((el) => el === undefined ? null : el) : []
    };

    await new Promise((resolve) => this.emit("find", sql, resolve));
    const r = (await this.db.all(sql.statement,
    ...sql.params)).map(this.loadData);

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
    const where = condToWhere(cond);

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
      UPDATE "${this.name}"
      SET ${setK.join(",")}
      ${where ? `WHERE ${where.clause}` : ""}`,
      params: [
        ...setV,
        ...(where ? where.params.map((el) => el === undefined ? null : el) : [])
      ]
    }

    await new Promise((resolve) => this.emit("update", sql, resolve));
    await this.db.run(sql.statement,
      ...sql.params);
  }

  public async delete(
    cond: Partial<Record<keyof T, any>>
  ) {
    await new Promise((resolve) => this.emit("pre-delete", {cond}, resolve));

    const where = condToWhere(cond);

    const sql: ISql = {
      statement: `
      DELETE FROM "${this.name}"
      ${where ? `WHERE ${where.clause}` : ""}`,
      params: (where ? where.params.map((el) => el === undefined ? null : el) : [])
    }

    await new Promise((resolve) => this.emit("delete", sql, resolve));
    await this.db.run(sql.statement,
      ...sql.params);
  }

  public chain(select?: Array<keyof T>): Chain<T> {
    return new Chain(this, select);
  }

  private loadData(data: any): Partial<T> {
    for (const [k, v] of Object.entries(data)) {
      const prop = (this.__meta.prop as any)[k];
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type];
        if (tr) {
          data[k] = tr.get(v);
        }
      }
    }

    return data;
  }

  public transformEntry(entry: Partial<T>): Record<string, string | number | null> {
    const output: Record<string, string | number | null> = {};

    for (let [k, v] of Object.entries<any>(entry)) {
      const prop = (this.__meta.prop as any)[k];
      if (prop && prop.type) {
        const tr = (this.__meta.transform as any)[prop.type];
        if (tr) {
          output[k] = tr.set(v);
        }
      }

      if (output[k] === undefined) {
        output[k] = v;
      }
    }

    return output;
  }
}

class Chain<T> {
  public cols: Record<string, Collection<any>> = {};
  public firstCol: Collection<T>;
  
  public select: string[] = [];
  public from: string[] = [];

  constructor(firstCol: Collection<T>, firstSelect?: Array<keyof T>) {
    this.cols[firstCol.name] = firstCol;
    this.firstCol = firstCol;

    if (firstSelect) {
      for (const l of firstSelect) {
        this.select.push(`"${firstCol.name}"."${l}" AS "${firstCol.name}__${l}"`);
      }
    }

    this.from.push(`FROM "${firstCol.name}"`);
  }

  public join<U>(
    to: Collection<U>,
    foreignField: string,
    localField: keyof T = "_id" as any,
    select?: Array<keyof U> | null,
    type?: "left" | "inner"
  ): this {
    if (select) {
      for (const r of select) {
        this.select.push(`"${to.name}"."${r}" AS "${to.name}__${r}"`);
      }
    }

    this.from.push(`${type || ""} JOIN "${to.name}" ON "${foreignField}" = "${to.name}".${localField}`);
    this.cols[to.name] = to;

    return this;
  }

  public sql(
    cond?: Record<string, any>, 
    postfix?: string
  ): ISql {
    const where = cond ? condToWhere(cond) : null;

    return {
      statement: `
      SELECT ${this.select.join(",")}
      ${this.from.join("\n")}
      ${where ? where.clause : ""}
      ${postfix || ""}`,
      params: where ? where.params : []
    };
  }

  public async data(
    cond?: Record<string, any>,
    postfix?: string
  ): Promise<Array<Record<string, Record<string, any>>>> {
    const sql = this.sql(cond, postfix);

    return (await this.firstCol.db.all(sql.statement, sql.params)).map((c) => {
      const item: Record<string, Record<string, any>> = {};

      for (const [k, v] of Object.entries<any>(c)) {
        const [tableName, r] = k.split("__");

        const prop = (this.cols[tableName].__meta.prop as any)[r];
        if (prop && prop.type) {
          const tr = (this.cols[tableName].__meta.transform as any)[prop.type];
          if (tr) {
            item[tableName] = item[tableName] || {};
            item[tableName][r] = tr.get(v);
          }
        }

        item[tableName] = item[tableName] || {};
        if (item[tableName][r] === undefined) {
          item[tableName][r] = v;
        }
      }
      
      return item;
    });
  }
}

function condToWhere(cond: Record<string, any>): { clause: string, params: any[] } | null {
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
import sqlite from "sqlite";
import Emittery from "emittery";
import { condToWhere } from "./cond";

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

export class Collection<T> extends Emittery.Typed<{
  "build": ISql,
  "pre-create": {entry: T, ignoreErrors: boolean},
  "create": ISql,
  "pre-find": {
    cond: Record<string, any>;
    fields?: string[] | null;
    postfix?: string;
  },
  "find": ISql,
  "pre-update": {
    cond: Record<string, any>;
    set: Partial<T>;
  },
  "update": ISql,
  "pre-delete": {
    cond: Record<string, any>;
  },
  "delete": ISql
}> {
  public __meta: {
    primary: IPrimaryRow;
    prop: Partial<Record<keyof T, IPropRow>>;
    fields: Array<keyof T | "_id">;
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
    const fields: Array<keyof T | "_id"> = [];
    if (primary.name) {
      if (Array.isArray(primary.name)) {
        fields.push(...primary.name);
      } else {
        fields.push(primary.name);
      }
    }
    fields.push(...Object.keys(prop) as any[]);

    this.__meta = {
      primary,
      prop,
      fields,
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

    await this.emit("build", sql);
    await this.db.exec(sql.statement);

    return this;
  }

  public async create(entry: T, ignoreErrors = false): Promise<number> {
    await this.emit("pre-create", {entry, ignoreErrors});

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

    await this.emit("create", sql);
    const r = await this.db.run(sql.statement, ...sql.params);

    return r.lastID;
  }

  public async find(
    cond: Record<string, any>,
    fields?: string[] | null,
    postfix?: string
  ): Promise<Partial<T>[]> {
    await this.emit("pre-find", {cond, fields, postfix});

    const where = condToWhere(cond);

    const selectClause: string[] = [];
    if (!fields) {
      selectClause.push("*");
    } else {
      fields.forEach((f) => {
        const fn = f.split(".");

        if (this.__meta.fields.includes(fn[0] as any)) {
          selectClause.push(f);
        }
      });
    }

    const sql: ISql = {
      statement: `
      SELECT ${selectClause.join(",")}
      FROM "${this.name}"
      ${where ? `WHERE ${where.clause}` : ""} ${postfix || ""}`,
      params: where ? where.params.map((el) => el === undefined ? null : el) : []
    };

    await this.emit("find", sql);
    const r = (await this.db.all(sql.statement,
    ...sql.params)).map((el) => this.loadData(el));

    return r;
  }

  public async get(
    cond: Record<string, any>,
    fields?: string[] 
  ): Promise<Partial<T> | null> {
    return (await this.find(cond, fields, "LIMIT 1"))[0] || null;
  }

  public async update(
    cond: Record<string, any>,
    set: Partial<T>,
  ) {
    await this.emit("pre-update", {cond, set});

    const setK: string[] = [];
    const setV: any[] = [];
    const where = condToWhere(cond);

    for (let [k, v] of Object.entries<any>(set)) {
      const prop = (this.__meta.prop as any)[k];
      if (prop) {
        const { type } = prop;
        const tr = type ? (this.__meta.transform as any)[type] : undefined;
        if (tr) {
          v = tr.set(v);
        }

        setK.push(`"${k}" = ?`);
        setV.push(v);
      }
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

    await this.emit("update", sql);
    await this.db.run(sql.statement,
      ...sql.params);
  }

  public async delete(
    cond: Record<string, any>
  ) {
    await this.emit("pre-delete", {cond});

    const where = condToWhere(cond);

    const sql: ISql = {
      statement: `
      DELETE FROM "${this.name}"
      ${where ? `WHERE ${where.clause}` : ""}`,
      params: (where ? where.params.map((el) => el === undefined ? null : el) : [])
    }

    await this.emit("delete", sql);
    await this.db.run(sql.statement,
      ...sql.params);
  }

  public chain(select?: Array<keyof T> | Record<keyof T, string>): Chain<T> {
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
  
  public select: Record<string, string> = {};
  public from: string[] = [];

  constructor(firstCol: Collection<T>, firstSelect?: Array<keyof T> | Record<keyof T, string>) {
    this.cols[firstCol.name] = firstCol;
    this.firstCol = firstCol;

    if (firstSelect) {
      if (Array.isArray(firstSelect)) {
        for (const l of firstSelect) {
          this.select[`"${firstCol.name}"."${l}"`] = `${firstCol.name}__${l}`;
        }
      } else {
        for (const [l, v] of Object.entries<string>(firstSelect)) {
          this.select[`"${firstCol.name}"."${l}"`] = v;
        }
      }
    }

    this.from.push(`FROM "${firstCol.name}"`);
  }

  get db() {
    return this.firstCol.db;
  }

  public join<U>(
    to: Collection<U>,
    foreignField: string,
    localField: keyof T = "_id" as any,
    select?: Array<keyof U> | Record<keyof U, string> | null,
    type?: "left" | "inner"
  ): this {
    if (select) {
      if (Array.isArray(select)) {
        for (const l of select) {
          this.select[`"${to.name}"."${l}"`] = `${to.name}__${l}`;
        }
      } else {
        for (const [l, v] of Object.entries<string>(select)) {
          this.select[`"${to.name}"."${l}"`] = v;
        }
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
      SELECT ${Object.entries(this.select).map(([k, v]) => `${k} AS "${v}"`).join(",")}
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

    return (await this.db.all(sql.statement, sql.params)).map((c) => {
      return this.transformRow(c);
    });
  }

  public transformRow(row: any) {
    const item: Record<string, Record<string, any>> = {};

    for (const [k, v] of Object.entries<any>(row)) {
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
  }
}
import "bluebird-global";
import sqlite from "sqlite";
import { Collection } from "./collection";

export class Db {
  public static async connect(filename: string, options?: any) {
    const sql = await sqlite.open(filename, options);
    return new Db({sql, filename});
  }

  public sql: sqlite.Database;
  public filename: string;
  public cols: Record<string, Collection<any>> = {};

  private constructor(params: any) {
    this.sql = params.sql;
    this.filename = params.filename;
  }

  public async collection<T>(model: T) {
    const col = new Collection(this.sql, model);
    await col.build();
    this.cols[col.name] = col;
    return col;
  }

  public async close() {
    await this.sql.close();
    return this;
  }
}

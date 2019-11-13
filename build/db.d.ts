import "bluebird-global";
import sqlite from "sqlite";
import { Collection } from "./collection";
export declare class Db {
    static connect(filename: string, options?: any): Promise<Db>;
    sql: sqlite.Database;
    filename: string;
    cols: Record<string, Collection<any>>;
    private constructor();
    collection<T>(model: T): Promise<Collection<T>>;
    close(): Promise<this>;
}
//# sourceMappingURL=db.d.ts.map
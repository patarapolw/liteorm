import sqlite from "sqlite";
import Emittery from "emittery";
export declare type SqliteNative = "string" | "integer" | "float" | "binary";
export declare type SqliteExt = "datetime" | "JSON";
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
    type: SqliteNative | SqliteExt;
    unique?: boolean;
    null?: boolean;
    references?: string;
    default?: any;
}
export declare class Collection<T> extends Emittery.Typed<{
    "build": ISql;
    "pre-create": {
        entry: T;
        ignoreErrors: boolean;
    };
    "create": ISql;
    "pre-find": {
        cond: Record<string, any>;
        fields?: string[] | null;
        postfix?: string;
    };
    "find": ISql;
    "pre-update": {
        cond: Record<string, any>;
        set: Partial<T>;
    };
    "update": ISql;
    "pre-delete": {
        cond: Record<string, any>;
    };
    "delete": ISql;
}> {
    __meta: {
        primary: IPrimaryRow;
        prop: Partial<Record<keyof T, IPropRow>>;
        fields: Array<keyof T | "_id">;
        unique?: string[][];
        transform: Record<SqliteExt, ITransformer<any>>;
    };
    db: sqlite.Database;
    name: string;
    constructor(db: sqlite.Database, model: T);
    build(): Promise<this>;
    create(entry: T, ignoreErrors?: boolean): Promise<number>;
    find(cond: Record<string, any>, fields?: string[] | null, postfix?: string): Promise<Partial<T>[]>;
    get(cond: Record<string, any>, fields?: string[]): Promise<Partial<T> | null>;
    update(cond: Record<string, any>, set: Partial<T>): Promise<void>;
    delete(cond: Record<string, any>): Promise<void>;
    chain(select?: Array<keyof T> | Record<keyof T, string>): Chain<T>;
    private loadData;
    transformEntry(entry: Partial<T>): Record<string, string | number | null>;
}
declare class Chain<T> {
    cols: Record<string, Collection<any>>;
    firstCol: Collection<T>;
    select: Record<string, string>;
    from: string[];
    constructor(firstCol: Collection<T>, firstSelect?: Array<keyof T> | Record<keyof T, string>);
    readonly db: sqlite.Database;
    join<U>(to: Collection<U>, foreignField: string, localField?: keyof T, select?: Array<keyof U> | Record<keyof U, string> | null, type?: "left" | "inner"): this;
    sql(cond?: Record<string, any>, postfix?: string): ISql;
    data(cond?: Record<string, any>, postfix?: string): Promise<Array<Record<string, Record<string, any>>>>;
    transformRow(row: any): Record<string, Record<string, any>>;
}
export {};
//# sourceMappingURL=collection.d.ts.map
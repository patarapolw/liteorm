import Emittery from 'emittery';
import sqlite3 from 'sqlite3';
import { IPrimaryRow, IPropRow, ISqliteMeta } from './decorators';
import { SQLParams, SqliteExt } from './utils';
export declare type UndefinedEqNull<E> = {
    [K in keyof E]: E[K] | (undefined extends E[K] ? null : never);
};
export interface ITransformer<T> {
    get: (repr: any) => T | null;
    set: (data: T) => any;
}
export declare class Column<T = any> {
    opts: {
        name: string;
        table: Table<any>;
        prop?: IPropRow<T> | IPrimaryRow<T>;
    };
    constructor(opts: {
        name: string;
        table: Table<any>;
        prop?: IPropRow<T> | IPrimaryRow<T>;
    });
    get tableName(): any;
    get name(): string;
}
export declare class Table<M = any, AdditionalProps extends {
    ROWID?: number;
    createdAt?: Date;
    updatedAt?: Date;
} = {}, E extends M & AdditionalProps = M & AdditionalProps> extends Emittery.Typed<{
    'build-sql': {
        stmt: string;
    };
    'pre-create': {
        entry: UndefinedEqNull<E>;
        options: {
            postfix: string[];
        };
    };
    'create-sql': {
        stmt: string;
        params: SQLParams;
    };
    'pre-update': {
        stmt: string;
        params: SQLParams;
        set: Partial<UndefinedEqNull<E>>;
    };
    'update-sql': {
        stmt: string;
        params: SQLParams;
    };
    'pre-delete': {
        stmt: string;
        params: SQLParams;
    };
    'delete-sql': {
        stmt: string;
        params: SQLParams;
    };
}> {
    c: Required<{
        [K in keyof E]: Column<E[K]>;
    }>;
    m: E & {
        __meta: ISqliteMeta<E>;
    };
    get primaryKey(): string;
    get name(): string;
    constructor(M: {
        new (): M;
    });
    __init(db: sqlite3.Database): Promise<void>;
    create(db: sqlite3.Database): (entry: UndefinedEqNull<E>, options?: {
        postfix?: string;
        ignoreErrors?: boolean;
    }) => Promise<number>;
    __updateBySql(db: sqlite3.Database): (stmt: string, params: SQLParams, set: Partial<E>) => Promise<void>;
    __deleteBySql(db: sqlite3.Database): (stmt: string, params: SQLParams) => Promise<void>;
    /**
     * @internal
     * @param k
     * @param method
     */
    transform(k: string, method?: 'get' | 'set'): (a: any) => any;
}
export declare const _transformers: Record<SqliteExt, ITransformer<any>>;
//# sourceMappingURL=table.d.ts.map
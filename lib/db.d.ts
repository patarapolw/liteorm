import sqlite3 from 'sqlite3';
import Emittery from 'emittery';
import { Table, Column, UndefinedEqNull } from './table';
import { SQLParams, RawSQL } from './utils';
export declare class Db extends Emittery.Typed<{
    'pre-find': {
        cond: any;
        tables: {
            type?: 'inner' | 'left' | 'cross' | 'natural';
            from?: Column;
            cond?: string;
            to: Column | Table<any>;
        }[];
        select: {
            [alias: string]: string | RawSQL | Column;
        };
        options: {
            postfix?: string;
            sort?: {
                key: Column | string;
                desc?: boolean;
            };
            offset?: number;
            limit?: number;
        };
    };
    'find-sql': {
        stmt: string;
        params: SQLParams;
    };
}> {
    sql: sqlite3.Database;
    constructor(filename: string | sqlite3.Database, options?: any);
    /**
     * Initialize tables sequentially, just in case foreign keys matter
     *
     * @param tables
     */
    init(tables: Table<any>[]): Promise<void>;
    create<E>(table: Table<E>): (entry: UndefinedEqNull<E & {}>, options?: {
        postfix?: string | undefined;
        ignoreErrors?: boolean | undefined;
    } | undefined) => Promise<number>;
    each(table0: Table<any>, ...tables: (Table<any> | {
        type?: 'inner' | 'left' | 'cross' | 'natural';
        from?: Column;
        cond?: string;
        to: Column | Table<any>;
    })[]): <Select extends {
        [alias: string]: string | RawSQL | Column<any>;
    } = Required<{
        [x: string]: Column<any>;
    }>, R = UndefinedEqNull<{ [K in keyof Select]: Select[K] extends Column<infer T> ? T : any; }>>(qCond: Record<string, any>, select: Select | "*", options?: {
        postfix?: string;
        sort?: {
            key: Column | string;
            desc?: boolean;
        };
        offset?: number;
        limit?: number;
    }) => (cb: (r: R) => void) => Promise<number>;
    all(table0: Table<any>, ...tables: (Table<any> | {
        type?: 'inner' | 'left' | 'cross' | 'natural';
        from?: Column;
        cond?: string;
        to: Column | Table<any>;
    })[]): <Select extends {
        [alias: string]: string | RawSQL | Column<any>;
    } = Required<{
        [x: string]: Column<any>;
    }>>(qCond: Record<string, any>, select: "*" | Select, options?: {
        postfix?: string;
        sort?: {
            key: Column | string;
            desc?: boolean;
        };
        offset?: number;
        limit?: number;
    }) => Promise<UndefinedEqNull<{ [K in keyof Select]: Select[K] extends Column<infer T> ? T : any; }>[]>;
    count(table0: Table<any>, ...tables: (Table<any> | {
        type?: 'inner' | 'left' | 'cross' | 'natural';
        from?: Column;
        cond?: string;
        to: Column | Table<any>;
    })[]): (qCond: Record<string, any>) => Promise<number>;
    first(table0: Table<any>, ...tables: (Table<any> | {
        type?: 'inner' | 'left' | 'cross' | 'natural';
        from?: Column;
        cond?: string;
        to: Column | Table<any>;
    })[]): <Select extends {
        [alias: string]: string | RawSQL | Column<any>;
    } = Required<{
        [x: string]: Column<any>;
    }>>(qCond: Record<string, any>, select: "*" | Select, options?: {
        postfix?: string;
        sort?: {
            key: Column | string;
            desc?: boolean;
        };
        offset?: number;
    }) => Promise<UndefinedEqNull<{ [K in keyof Select]: Select[K] extends Column<infer T> ? T : any; }>>;
    update(table0: Table<any>, ...tables: (Table<any> | {
        type?: 'inner' | 'left' | 'cross' | 'natural';
        from?: Column;
        cond?: string;
        to: Column | Table<any>;
    })[]): (qCond: Record<string, any>, set: Record<string, any> | {
        table: Table<any>;
        set: Record<string, any>;
    }[], options?: {
        postfix?: string;
        sort?: {
            key: Column | string;
            desc?: boolean;
        };
        offset?: number;
        limit?: number;
    }) => Promise<void>;
    delete(table0: Table<any>, ...tables: (Table<any> | {
        type?: 'inner' | 'left' | 'cross' | 'natural';
        from?: Column;
        cond?: string;
        to: Column | Table<any>;
    })[]): (qCond: Record<string, any>, options?: {
        postfix?: string;
        sort?: {
            key: Column | string;
            desc?: boolean;
        };
        offset?: number;
        limit?: number;
    }) => Promise<void>;
    close(): Promise<void>;
    private _find;
    private _findIds;
}
//# sourceMappingURL=db.d.ts.map
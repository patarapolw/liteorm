import 'reflect-metadata';
import { ITransformer, Table } from './table';
import { AliasToJSType, AliasToSqliteType, RawSQL, SqliteAllTypes } from './utils';
export declare function primary<T extends AliasToJSType[TSql] = any, Entry = any, TSql extends keyof typeof AliasToSqliteType = any>(params?: {
    name?: string;
    type?: TSql;
    autoincrement?: boolean;
    default?: RawSQL | T | ((entry: Entry) => T | Promise<T>);
    onUpdate?: T | ((entry: Entry) => T | Promise<T>);
    onChange?: T | ((entry: Entry) => T | Promise<T>);
}): PropertyDecorator;
export declare function prop<T extends AliasToJSType[TSql] = any, Entry = any, TSql extends keyof typeof AliasToSqliteType = any>(params?: {
    name?: string;
    type?: TSql;
    index?: string | boolean;
    unique?: string | boolean;
    collate?: string | boolean;
    null?: boolean;
    references?: string | Table<any> | {
        table: Table<any>;
        key: string;
    };
    default?: RawSQL | T | ((entry: Entry) => T | Promise<T>);
    onUpdate?: T | ((entry: Entry) => T | Promise<T>);
    onChange?: T | ((entry: Entry) => T | Promise<T>);
    transform?: Partial<ITransformer<T>>;
}): PropertyDecorator;
export declare function Entity<T>(params?: {
    name?: string;
    primary?: (keyof T)[];
    index?: ((keyof T)[] | {
        name: string;
        keys: (keyof T)[];
    })[];
    unique?: ((keyof T)[] | {
        name: string;
        keys: (keyof T)[];
    })[];
    timestamp?: boolean | {
        createdAt?: boolean;
        updatedAt?: boolean;
    };
}): ClassDecorator;
export interface IPrimaryRow<T extends AliasToJSType[TSql] = any, Entry = any, TSql extends SqliteAllTypes = any> {
    name: string | string[];
    type?: TSql;
    autoincrement: boolean;
    default?: RawSQL | T | ((entry: Entry) => T | Promise<T>);
    onUpdate?: T | ((entry: Entry) => T | Promise<T>);
    onChange?: T | ((entry: Entry) => T | Promise<T>);
}
export interface IPropRow<T extends AliasToJSType[TSql] = any, Entry = any, TSql extends SqliteAllTypes = any> {
    type: TSql;
    unique?: string;
    null: boolean;
    index?: string;
    collate?: string;
    references?: string;
    default?: RawSQL | T | ((entry: Entry) => T | Promise<T>);
    onUpdate?: T | ((entry: Entry) => T | Promise<T>);
    onChange?: T | ((entry: Entry) => T | Promise<T>);
    transform?: Partial<ITransformer<T>>;
}
export interface ISqliteMeta<T> {
    name: string;
    primary?: IPrimaryRow;
    prop: Partial<Record<keyof T, IPropRow>>;
    unique?: {
        name: string;
        keys: (keyof T)[];
    }[];
    index?: {
        name: string;
        keys: (keyof T)[];
    }[];
    createdAt: boolean;
    updatedAt: boolean;
}
//# sourceMappingURL=decorators.d.ts.map
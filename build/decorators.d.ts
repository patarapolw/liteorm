import "reflect-metadata";
import { SqliteNative, SqliteExt } from "./collection";
export declare function primary(params?: {
    name?: string;
    type?: SqliteNative;
    autoincrement?: boolean;
}): PropertyDecorator;
export declare function prop(params?: {
    name?: string;
    type?: SqliteNative | SqliteExt;
    unique?: boolean;
    null?: boolean;
    references?: string;
    default?: string;
}): PropertyDecorator;
export declare function Table<T>(params?: {
    name?: string;
    primary?: Array<keyof T>;
    unique?: Array<keyof T>[];
}): ClassDecorator;
//# sourceMappingURL=decorators.d.ts.map
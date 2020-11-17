/**
 * @internal
 *
 * Please use sql template string instead.
 *
 * ```js
 * sql`COUNT (*)`
 * ```
 */
export declare class RawSQL {
    content: string;
    constructor(content: string);
}
/**
 * Pure string tagged template literal for sql.
 *
 * ```js
 * sql`COUNT (*)`
 * sql('COUNT (*)')
 * ```
 */
export declare function sql(ss: TemplateStringsArray | string, ...vs: string[]): RawSQL;
/**
 * @internal
 *
 * SQLParams placeholder
 */
export declare class SQLParams {
    data: Record<string, any>;
    counter: number;
    add(v: any): string;
}
/**
 * https://www.sqlite.org/datatype3.html
 */
export declare type SqliteNative = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';
export declare type SqliteExt = 'Boolean' | 'Date' | 'JSON' | 'StringArray';
export declare type SqliteAllTypes = SqliteNative | SqliteExt;
export declare const AliasToSqliteType: Record<string, string>;
export interface AliasToJSType extends Record<keyof typeof AliasToSqliteType, any> {
    /**
     * Identity types
     */
    TEXT: string;
    INTEGER: number;
    REAL: number;
    BLOB: ArrayBuffer;
    /**
     * Class name types
     */
    String: string;
    Number: number;
    Date: Date;
    ArrayBuffer: ArrayBuffer;
    Boolean: boolean;
    Object: Record<string, any> | any[];
    /**
     * Additional aliases
     */
    JSON: Record<string, any> | any[];
    StringArray: string[];
    str: string;
    string: string;
    int: number;
    integer: number;
    float: number;
    bin: ArrayBuffer;
    binary: ArrayBuffer;
    boolean: boolean;
    bool: boolean;
}
export declare function normalizeAlias(k: keyof AliasToJSType): SqliteAllTypes;
export declare function isNullOrUndefined(a: any): a is null | undefined;
/**
 * https://www.sqlite.org/lang_keywords.html
 * @param s identifier
 */
export declare function safeColumnName(s: string): string;
//# sourceMappingURL=utils.d.ts.map
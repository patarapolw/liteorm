"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeColumnName = exports.isNullOrUndefined = exports.normalizeAlias = exports.AliasToSqliteType = exports.SQLParams = exports.sql = exports.RawSQL = void 0;
/**
 * @internal
 *
 * Please use sql template string instead.
 *
 * ```js
 * sql`COUNT (*)`
 * ```
 */
class RawSQL {
    constructor(content) {
        this.content = content;
    }
}
exports.RawSQL = RawSQL;
/**
 * Pure string tagged template literal for sql.
 *
 * ```js
 * sql`COUNT (*)`
 * sql('COUNT (*)')
 * ```
 */
function sql(ss, ...vs) {
    return typeof ss === 'string'
        ? new RawSQL(ss)
        : new RawSQL(ss.map((s, i) => `${s}${vs[i] || ''}`).join(''));
}
exports.sql = sql;
/**
 * @internal
 *
 * SQLParams placeholder
 */
class SQLParams {
    constructor() {
        this.data = {};
        this.counter = 0;
    }
    add(v) {
        if (Object.keys(this.data).length >= 1000) {
            throw new Error('SQLITE_LIMIT_VARIABLE_NUMBER exceeded. (default value: 999)');
        }
        let k = '$' + ++this.counter;
        while (this.data[k]) {
            k = '$' + ++this.counter;
        }
        this.data[k] = v;
        return k;
    }
}
exports.SQLParams = SQLParams;
exports.AliasToSqliteType = {
    /**
     * Identity types
     */
    TEXT: `TEXT`,
    INTEGER: `INTEGER`,
    REAL: `REAL`,
    BLOB: `BLOB`,
    /**
     * Class name types
     */
    String: `TEXT`,
    Number: `REAL`,
    Date: `INTEGER`,
    ArrayBuffer: `BLOB`,
    Boolean: `INTEGER`,
    Object: `TEXT`,
    /**
     * Additional aliases
     */
    JSON: `TEXT`,
    StringArray: `TEXT`,
    str: `TEXT`,
    string: `TEXT`,
    int: `INTEGER`,
    integer: `INTEGER`,
    float: `REAL`,
    bin: `BLOB`,
    binary: `BLOB`,
    boolean: `INTEGER`,
    bool: `INTEGER`,
};
const normalizer = `
/**
 * Class name types
 */
String: string // TEXT
Number: number // REAL
Date: Date
ArrayBuffer: ArrayBuffer // BLOB
Boolean: boolean
Object: Record<string, any> | any[] // JSON
/**
 * Additional aliases
 */
JSON: Record<string, any> | any[]
StringArray: string[]
str: string // TEXT
string: string // TEXT
int: number // INTEGER
integer: number // INTEGER
float: number // REAL
bin: ArrayBuffer // BLOB
binary: ArrayBuffer // BLOB
boolean: boolean // Boolean
bool: boolean // Boolean
  `.split('\n')
    .map((r) => r.trim())
    .map((r) => {
    if (r) {
        const m = /^(.+?):.+?\/\/ (.+)$/.exec(r);
        if (m) {
            return [m[1], m[2]];
        }
    }
    return null;
})
    .filter((r) => r)
    .map((r) => r)
    .reduce((prev, [k, v]) => ({ ...prev, [k]: v }), {});
function normalizeAlias(k) {
    return normalizer[k] || k;
}
exports.normalizeAlias = normalizeAlias;
function isNullOrUndefined(a) {
    if (a === null || a === undefined) {
        return true;
    }
    return false;
}
exports.isNullOrUndefined = isNullOrUndefined;
/**
 * https://www.sqlite.org/lang_keywords.html
 * @param s identifier
 */
function safeColumnName(s) {
    const keywords = `
    ABORT
    ACTION
    ADD
    AFTER
    ALL
    ALTER
    ALWAYS
    ANALYZE
    AND
    AS
    ASC
    ATTACH
    AUTOINCREMENT
    BEFORE
    BEGIN
    BETWEEN
    BY
    CASCADE
    CASE
    CAST
    CHECK
    COLLATE
    COLUMN
    COMMIT
    CONFLICT
    CONSTRAINT
    CREATE
    CROSS
    CURRENT
    CURRENT_DATE
    CURRENT_TIME
    CURRENT_TIMESTAMP
    DATABASE
    DEFAULT
    DEFERRABLE
    DEFERRED
    DELETE
    DESC
    DETACH
    DISTINCT
    DO
    DROP
    EACH
    ELSE
    END
    ESCAPE
    EXCEPT
    EXCLUDE
    EXCLUSIVE
    EXISTS
    EXPLAIN
    FAIL
    FILTER
    FIRST
    FOLLOWING
    FOR
    FOREIGN
    FROM
    FULL
    GENERATED
    GLOB
    GROUP
    GROUPS
    HAVING
    IF
    IGNORE
    IMMEDIATE
    IN
    INDEX
    INDEXED
    INITIALLY
    INNER
    INSERT
    INSTEAD
    INTERSECT
    INTO
    IS
    ISNULL
    JOIN
    KEY
    LAST
    LEFT
    LIKE
    LIMIT
    MATCH
    NATURAL
    NO
    NOT
    NOTHING
    NOTNULL
    NULL
    NULLS
    OF
    OFFSET
    ON
    OR
    ORDER
    OTHERS
    OUTER
    OVER
    PARTITION
    PLAN
    PRAGMA
    PRECEDING
    PRIMARY
    QUERY
    RAISE
    RANGE
    RECURSIVE
    REFERENCES
    REGEXP
    REINDEX
    RELEASE
    RENAME
    REPLACE
    RESTRICT
    RIGHT
    ROLLBACK
    ROW
    ROWS
    SAVEPOINT
    SELECT
    SET
    TABLE
    TEMP
    TEMPORARY
    THEN
    TIES
    TO
    TRANSACTION
    TRIGGER
    UNBOUNDED
    UNION
    UNIQUE
    UPDATE
    USING
    VACUUM
    VALUES
    VIEW
    VIRTUAL
    WHEN
    WHERE
    WINDOW
    WITH
    WITHOUT`
        .split('\n')
        .map((el) => el.trim())
        .filter((el) => el);
    /**
     * https://stackoverflow.com/questions/31788990/sqlite-what-are-the-restricted-characters-for-identifiers
     */
    const validIdToken = 'A-Z0-9_$:';
    const kwRegex = new RegExp(`(^|[^${validIdToken}\\)])(${keywords.join('|')})($|[^${validIdToken}\\()])`, 'gi');
    return s.replace(kwRegex, (_, p1, p2, p3) => {
        return `${p1}"${p2.replace(/"/g, '["]')}"${p3}`;
    });
}
exports.safeColumnName = safeColumnName;
//# sourceMappingURL=utils.js.map
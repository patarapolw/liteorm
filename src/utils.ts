import { SQLStatement } from 'sql-template-strings'

import { SQL } from './compat/sql-template-strings'

/**
 * https://www.sqlite.org/datatype3.html
 */
export type SqliteNative = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'
export type SqliteExt = 'Boolean' | 'Date' | 'JSON' | 'StringArray'
export type SqliteAllTypes = SqliteNative | SqliteExt

export const AliasToSqliteType: Record<string, SQLStatement> = {
  /**
   * Identity types
   */
  TEXT: SQL`TEXT`,
  INTEGER: SQL`INTEGER`,
  REAL: SQL`REAL`,
  BLOB: SQL`BLOB`,
  /**
   * Class name types
   */
  String: SQL`TEXT`,
  Number: SQL`REAL`,
  Date: SQL`INTEGER`,
  ArrayBuffer: SQL`BLOB`,
  Boolean: SQL`INTEGER`,
  Object: SQL`TEXT`,
  /**
   * Additional aliases
   */
  JSON: SQL`TEXT`,
  StringArray: SQL`TEXT`,
  str: SQL`TEXT`,
  string: SQL`TEXT`,
  int: SQL`INTEGER`,
  integer: SQL`INTEGER`,
  float: SQL`REAL`,
  bin: SQL`BLOB`,
  binary: SQL`BLOB`,
  boolean: SQL`INTEGER`,
  bool: SQL`INTEGER`,
}

export interface AliasToJSType extends Record<keyof typeof AliasToSqliteType, any> {
  /**
   * Identity types
   */
  TEXT: string
  INTEGER: number
  REAL: number
  BLOB: ArrayBuffer
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
}

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
      const m = /^(.+?):.+?\/\/ (.+)$/.exec(r)
      if (m) {
        return [m[1], m[2]]
      }
    }
    return null
  })
  .filter((r) => r)
  .map((r) => r as any[])
  .reduce((prev, [k, v]) => ({ ...prev, [k]: v }), {}) as Record<string, SqliteAllTypes>

export function normalizeAlias (k: keyof AliasToJSType): SqliteAllTypes {
  return normalizer[k] || k
}

export function isNullOrUndefined (a: any): a is null | undefined {
  if (a === null || a === undefined) {
    return true
  }
  return false
}

/**
 * https://www.sqlite.org/lang_keywords.html
 * @param s identifier
 */
export function safeColumnName (s: string) {
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
    .filter((el) => el)

  /**
   * https://stackoverflow.com/questions/31788990/sqlite-what-are-the-restricted-characters-for-identifiers
   */
  const validIdToken = 'A-Z0-9_$:'
  const kwRegex = new RegExp(`(^|[^${validIdToken}\\)])(${keywords.join('|')})($|[^${validIdToken}\\()])`, 'gi')

  return s.replace(kwRegex, '$1"$2"$3')
}

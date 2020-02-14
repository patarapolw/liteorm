# liteorm

A simple wrapper for [sqlite](sqlite); with typings based on [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and [reflect-metadata](https://www.npmjs.com/package/reflect-metadata).

[![npm version](https://badge.fury.io/js/liteorm.svg)](https://badge.fury.io/js/liteorm)

- Async eventemitter ([emittery](https://www.npmjs.com/package/emittery)).
- JSON, Date, and MongoDB interop.
- Query with JSON, and tested with <https://q2search.herokuapp.com/LiteORM>, using MongoDB-like languages, with some differences (for example, `$regex` is currently not supported, use `$like`, `$nlike`, `$substr`, `$nsubstr` instead.)
- JSON querying is supported via JSON1 extension. I made it easy to query using dot notation, just like MongoDB.
  - So, you can use `data.a`
- Multiple SQLite databases, with cloned schemas or different schemas. Strongly-typed in the IDE.

## Usage

For example, please see [/tests/suites](https://github.com/patarapolw/liteorm/tree/master/tests/suites)

## Querying data

To query, you have to supply condition `{ 'a.b': 'c' }`, and optional field selector `['a']` or `{ 'a': 'b' }` (`a AS b`). If no field is supplied, all fields will be selected.

## Joining aka `chain()`

Joining (left and inner) is implemented through `chain()` method. The row name will now be `table__row` (in order not to interfere with dot notation), which still support JSON and Date conversion.

## Installation

```sh
npm i liteorm
```

## Caveats

- Type `Number` by default is associated with `INTEGER`. To change it to `FLOAT`, use

```typescript
@prop({type: 'float'}) f!: number;
```

- `BLOB` is associated with Type `ArrayBuffer`.

```typescript
@prop() data!: ArrayBuffer;
```

- `references`, i.e. Foreign Key, is currently implemented at `CREATE TABLE` only. Joins (chaining) still has to be done manually.

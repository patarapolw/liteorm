# liteorm

A simple wrapper for [sqlite](https://www.npmjs.com/package/sqlite); with typings based on [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and [reflect-metadata](https://www.npmjs.com/package/reflect-metadata).

[![npm version](https://badge.fury.io/js/liteorm.svg)](https://badge.fury.io/js/liteorm)

- Async eventemitter ([emittery](https://www.npmjs.com/package/emittery))
  - I make sure that you can intercept query objects and raw SQL (as well as their parameters) in an async way
- ~~Auto-define `_id` as `PRIMARY KEY INTEGER AUTOINCREMENT` (Use `_id` as default name for primary key)~~
  - I use ROWID, instead.
- Auto-append `createdAt`, `updatedAt` if `@Table({ timestamp: true })`
- JSON, Date, Boolean, and MongoDB interop
- Additional type `StringArray`, inspired by [Anki schema](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure)
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
# or yarn add liteorm
```

## Caveats

- Type `Number` by default is associated with `REAL`. To change it to `INTEGER`, use

```ts
@prop({type: 'int'}) count!: number;
```

- `BLOB` is associated with Type `ArrayBuffer`.

```ts
@prop() data!: ArrayBuffer;
```

- To get a strongly-typed `default` / `onUpdate`, you might have to declare typing twice.

```ts
@prop<Record<string, string>>({ default: () => ({}) }) data!: Record<string, string>;
@prop<number, EntryClass>({ default: 1, onUpdate: (ent) => parseToInt(ent) }) order!: number;
```

- You might have to declare your own interface to get keys for `createdAt`, `updatedAt`, because typing is based directly on Class.

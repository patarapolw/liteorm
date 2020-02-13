# liteorm

A simple wrapper for [sqlite](sqlite); with typings based on [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and [reflect-metadata](https://www.npmjs.com/package/reflect-metadata). With async eventemitter ([emittery](https://www.npmjs.com/package/emittery)). Focusing on JSON, Date, and MongoDB interop.

Also, support multiple SQLite databases, with cloned schemas or different schemas.

## Usage

For example, please see [/tests](https://github.com/patarapolw/liteorm/tree/master/tests)

## Querying data

To query, you have to supply both condition `{"a.b": "c"}` and field selector `["a.b AS ab"]`. If no field is supplied, all fields will be selected.

## JSON support

JSON querying is supported via JSON1 extension. I made it easy to query using dot notation, just like MongoDB.

## Joining aka `chain()`

Joining (left and inner) is implemented through `chain()` method. The row name will now be `table__row` (in order not to interfere with dot notation), which still support JSON and Date conversion.

## Installation

```sh
npm i liteorm
```

## Caveats

- Type `Number` by default is associated with `INTEGER`. To change it to `FLOAT`, use

```typescript
@prop({type: "float"}) f!: number;
```

- `BLOB` is associated with Type `ArrayBuffer`.

```typescript
@prop() data!: ArrayBuffer;
```

- `references`, i.e. Foreign Key, is currently implemented at `CREATE TABLE` only. Joins (chaining) still has to be done manually.

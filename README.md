# liteorm

A simple wrapper for [sqlite](sqlite); with typings based on [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and [reflect-metadata](https://www.npmjs.com/package/reflect-metadata). With async eventemitter ([emittery](https://www.npmjs.com/package/emittery)). Focusing on JSON, Date, and MongoDB interop.

## Usage

```typescript
import { Table, primary, prop, Collection } from "liteorm";
import sqlite from "sqlite";

@Table({name: "deck"})
class DbDeck {
  @primary({autoincrement: true}) _id?: number;
  @prop({unique: true}) name!: string;
}

@Table({name: "source"})
class DbSource {
  @primary({autoincrement: true}) _id?: number;
  @prop({unique: true}) h!: string;
  @prop() name!: string;
  @prop() created!: Date;
}

@Table({name: "template", unique: [["front", "back", "css", "js"]]})
class DbTemplate {
  @primary({autoincrement: true}) _id?: number;
  @prop() name!: string;
  @prop({references: "source(_id)", null: true}) sourceId?: number;
  @prop() front!: string;
  @prop({null: true}) back?: string;
  @prop({null: true}) css?: string;
  @prop({null: true}) js?: string;
}

@Table({name: "note"})
class DbNote {
  @primary({autoincrement: true}) _id?: number;
  @prop({unique: true}) key?: string;
  @prop() name!: string;
  @prop({references: "source(_id)", null: true}) sourceId?: number;
  @prop() data!: Record<string, any>;
  @prop() order!: Record<string, number>;
}

@Table({name: "media"})
class DbMedia {
  @primary({autoincrement: true}) _id?: number;
  @prop({unique: true}) h?: string;
  @prop({references: "source(_id)", null: true}) sourceId?: number;
  @prop() name!: string;
  @prop() data!: ArrayBuffer;
}

@Table({name: "card"})
class DbCard {
  @primary() _id!: string;
  @prop({references: "deck(_id)"}) deckId!: number;
  @prop({references: "template(_id)", null: true}) templateId?: number;
  @prop({references: "note(_id)", null: true}) noteId?: number;
  @prop() front!: string;
  @prop({null: true}) back?: string;
  @prop({null: true}) mnemonic?: string;
  @prop({null: true}) srsLevel?: number;
  @prop({null: true}) nextReview?: Date;
  @prop({null: true}) tag?: string[];
  @prop() created!: Date;
  @prop({null: true}) modified?: Date;
  @prop({null: true}) stat?: {
    streak: { right: number; wrong: number };
  };
}

const db = await sqlite.open(filename);
const deck = await new Collection(db, new DbDeck()).build();
const source = await new Collection(db, new DbSource()).build();
const template = await new Collection(db, new DbTemplate()).build();
const note = await new Collection(db, new DbNote()).build();
const media = await new Collection(db, new DbMedia()).build();
const card = await new Collection(db, new DbCard()).build();

note.on("pre-create", async (p) => {
  if (p.entry.data && !p.entry.key) {
    p.entry.key = await hashingFunction(p.entry.data);
  }
});
```

Joining (left and inner) is also implemented, see <https://github.com/patarapolw/r2r-sqlite/blob/master/src/index.ts#L261>

For more, see <https://github.com/patarapolw/r2r-sqlite/blob/master/src/index.ts>

## Installation

```
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

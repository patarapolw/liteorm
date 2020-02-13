# liteorm

A simple wrapper for [sqlite](sqlite); with typings based on [TypeScript decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and [reflect-metadata](https://www.npmjs.com/package/reflect-metadata). With async eventemitter ([emittery](https://www.npmjs.com/package/emittery)). Focusing on JSON, Date, and MongoDB interop.

Also, support multiple SQLite databases, with cloned schemas or different schemas.

## Usage

```typescript
import { Db, Table, primary, prop } from "liteorm";
import crypto from "crypto";

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

(async () => {
  const db = await Db.connect("test.db");

  const deck = await db.collection(new DbDeck());
  const source = await db.collection(new DbSource());
  const template = await db.collection(new DbTemplate());
  const note = await db.collection(new DbNote());
  const media = await db.collection(new DbMedia());
  const card = await db.collection(new DbCard());

  note.on("pre-create", async (p) => {
    if (!p.entry.key) {
      p.entry.key = await new Promise((resolve, reject) => {
        crypto.randomBytes(48, (err, buffer) => {
          err ? reject(err) : resolve(buffer.toString("base64"));
        })
      });
    }
  });
})().catch(console.error);
```

## Querying data

To query, you have to supply both condition `{"a.b": "c"}` and field selector `["a.b AS ab"]`. If no field is supplied, all fields will be selected.

## JSON support

JSON querying is supported via JSON1 extension. I made it easy to query using dot notation, just like MongoDB.

## Joining aka `chain()`

Joining (left and inner) is implemented through `chain()` method. The row name will now be `table__row` (in order not to interfere with dot notation), which still support JSON and Date conversion.

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

import crypto from 'crypto'
import fs from 'fs'

import faker from 'faker'
import nanoid from 'nanoid'

import { Db, Table, primary, prop, Collection } from '../../src'

@Table({ name: 'note', timestamp: true })
class DbNote {
  @prop({ unique: true }) key?: string
  @prop() data!: Record<string, any>
  @prop() order!: Record<string, number>
}

const dbNote = Collection.make(DbNote)

@Table({ name: 'card', timestamp: true })
class DbCard {
  @primary() _id!: string
  @prop({ references: dbNote }) noteId!: any
  @prop() front!: string
  @prop({ null: true }) back?: string
  @prop({ null: true }) nextReview?: Date
  @prop({
    default: () => ({
      streak: { right: 0, wrong: 0 },
    }),
  }) stat?: {
    streak: { right: number; wrong: number }
  }

  @prop({ type: 'int', default: () => Math.random() * 1000 }) randomInt?: number
  @prop({ default: () => Math.random() }) randomFloat?: number
}

const dbCard = Collection.make(DbCard)

@Table({ name: 'media', timestamp: true })
class DbMedia {
  @prop() name!: string
  @prop() data!: ArrayBuffer
}

const dbMedia = Collection.make(DbMedia)

export async function initDatabase (filename: string = 'tests/test.db') {
  const db = await Db.connect(filename)
  await Collection.init(db, [dbNote, dbCard, dbMedia])

  _db = {
    db,
    cols: {
      note: dbNote,
      media: dbMedia,
      card: dbCard,
    },
  }

  return _db
}

export async function createDatabase (filename: string = 'tests/test.db') {
  if (fs.existsSync(filename)) {
    fs.unlinkSync(filename)
  }

  const db = await initDatabase(filename)

  await Promise.all(Array.from({ length: 1000 }).map(async () => {
    try {
      await db.cols.media.create({
        name: faker.system.fileName(undefined, 'image'),
        data: crypto.randomBytes(256),
      })
    } catch (e) {
      console.error(e)
    }
  }))

  await Promise.all(Array.from({ length: 1000 }).map(async () => {
    try {
      const data = Array.from({ length: faker.random.number(5) })
        .map(() => [faker.hacker.noun(), faker.hacker.phrase()])
        .reduce((prev, [k, v]) => ({ ...prev, [k]: v }), {})

      const noteId = await db.cols.note.create({
        key: nanoid(),
        data,
        order: Object.keys(data).map((k, i) => [k, i]).reduce((prev, [k, i]) => ({ ...prev, [k]: i }), {}),
      })

      await Promise.all(Array.from({ length: faker.random.number(3) }).map(async () => {
        try {
          await db.cols.card.create({
            _id: nanoid(),
            noteId,
            front: faker.lorem.sentences(),
            back: faker.random.number(5) === 0
              ? undefined
              : faker.lorem.sentences(),
            nextReview: faker.random.number(5) === 0
              ? undefined
              : faker.date.between(new Date(2000, 1), new Date(2030, 12)),
            stat: faker.random.number(5) === 0
              ? undefined
              : {
                streak: {
                  right: faker.random.number(10),
                  wrong: faker.random.number(10),
                },
              },
          })
        } catch (e) {
          console.error(e)
        }
      }))
    } catch (e) {
      console.error(e)
    }
  }))

  _db = db

  return _db
}

let _db: {
  db: Db
  cols: {
    note: Collection<DbNote>
    media: Collection<DbMedia>
    card: Collection<DbCard>
  }
}

export { _db as db }

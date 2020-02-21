import crypto from 'crypto'
import fs from 'fs'

import faker from 'faker'

import { Db, Table, primary, prop, Entity } from '../../src'
import { SafeIds } from '../../src/utils'

@Entity({ name: 'note', timestamp: true })
class DbNote {
  @prop({ unique: true }) key?: string
  @prop() data!: Record<string, any>
  @prop() order!: Record<string, number>
}

export const dbNote = new Table(DbNote)

@Entity({ name: 'card', timestamp: true })
class DbCard {
  @primary() _id!: string
  @prop({ references: dbNote }) noteId!: any
  @prop() isCool!: boolean
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
  @prop({ type: 'StringArray', null: true }) v2b?: string[]
}

export const dbCard = new Table(DbCard)

@Entity({ name: 'media', timestamp: true })
class DbMedia {
  @prop() name!: string
  @prop() data!: ArrayBuffer
}

export const dbMedia = new Table(DbMedia)

let _db: Db

export async function initDatabase (filename: string = 'tests/test.db') {
  const db = await Db.connect(filename)
  await db.init([dbNote, dbCard, dbMedia])
  _db = db
}

export async function createDatabase (filename: string = 'tests/test.db') {
  if (fs.existsSync(filename)) {
    fs.unlinkSync(filename)
  }

  await initDatabase(filename)

  await Promise.all(Array.from({ length: 1000 }).map(async () => {
    try {
      await _db.create(dbMedia)({
        name: faker.system.fileName(undefined, 'image'),
        data: crypto.randomBytes(256),
      })
    } catch (e) {
      console.error(e)
    }
  }))

  const ids = new SafeIds(5000)

  await Promise.all(Array.from({ length: 1000 }).map(async () => {
    try {
      const data = Array.from({ length: faker.random.number(5) })
        .map(() => [faker.hacker.noun(), faker.hacker.phrase()])
        .reduce((prev, [k, v]) => ({ ...prev, [k]: v }), {})

      const noteId = await _db.create(dbNote)({
        key: ids.pop(),
        data,
        order: Object.keys(data).map((k, i) => [k, i]).reduce((prev, [k, i]) => ({ ...prev, [k]: i }), {}),
      })

      await Promise.all(Array.from({ length: faker.random.number(3) }).map(async () => {
        try {
          await _db.create(dbCard)({
            _id: ids.pop(),
            isCool: faker.random.arrayElement([true, false]),
            v2b: faker.random.number(5) === 0
              ? undefined
              : Array.from({ length: faker.random.number(5) })
                .map(() => faker.random.arrayElement(['is', 'am', 'are', 'was', 'were'])),
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
}

export { _db as db }

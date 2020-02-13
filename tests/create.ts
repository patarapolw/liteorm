import crypto from 'crypto'

import faker from 'faker'
import nanoid from 'nanoid'

import { Db, Table, primary, prop } from '../src'

@Table({ name: 'card', timestamp: true })
class DbCard {
  @primary() _id!: string
  @prop({ references: 'note(_id)' }) noteId!: number
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
}

@Table({ name: 'media', timestamp: true })
class DbMedia {
  @primary({ autoincrement: true }) _id?: number
  @prop() name!: string
  @prop() data!: ArrayBuffer
}

@Table({ name: 'note', timestamp: true })
class DbNote {
  @primary({ autoincrement: true }) _id?: number
  @prop({ unique: true }) key?: string
  @prop() data!: Record<string, any>
  @prop() order!: Record<string, number>
}

export async function initDatabase () {
  const db = await Db.connect('tests/test.db')

  return {
    db,
    cols: {
      note: await db.collection(new DbNote()),
      media: await db.collection(new DbMedia()),
      card: await db.collection(new DbCard()),
    },
  }
}

if (require.main === module) {
  (async () => {
    const db = await initDatabase()

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

    await db.db.close()
  })().catch(console.error)
}

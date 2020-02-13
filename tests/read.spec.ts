import assert from 'assert'

import { initDatabase } from './create'

type Then<T> = T extends PromiseLike<infer U> ? U : T
let db: Then<ReturnType<typeof initDatabase>>

before(async () => {
  db = await initDatabase()
  db.cols.card.on('find', (sql) => console.dir(sql, { depth: null }))
})

describe('readDatabase', () => {
  ;[
    {
      front: { $substr: 'Lorem' },
    },
    {
      'stat.streak.right': { $gt: 8 },
    },
    {
      nextReview: { $gt: new Date(2029, 12) },
    },
  ].map((cond) => {
    it(JSON.stringify(cond), async () => {
      console.dir(await db.cols.card.find(cond, { 'COUNT(*)': 'count' }), { depth: null })
      // console.dir(await db.cols.card.find(cond, ['front', 'stat', 'nextReview'], 'LIMIT 5'), { depth: null })
    })
  })

  ;[
    {
      notExists: 'abc',
    },
  ].map((cond) => {
    it(JSON.stringify(cond), async () => {
      await db.cols.card.find(cond, null, 'LIMIT 5').catch((err) => {
        assert(err, 'Error should be thrown.')
      })
    })
  })
})

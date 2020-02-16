import assert from 'assert'

import { db } from './0-create'

export default () => describe('readDatabase', () => {
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
      // db.cols.card.on('find', console.log)

      console.dir(await db.cols.card.find(cond, { 'COUNT(*)': 'count' }), { depth: null })
      console.dir(await db.cols.card.find(cond, ['front', 'stat', 'nextReview', 'isCool'], {
        sort: {
          key: 'front',
          desc: true,
        },
        offset: 10,
        limit: 5,
      }), { depth: null })

      // db.cols.card.off('find', console.log)
    })
  })

  ;[
    {
      notExists: 'abc',
    },
  ].map((cond) => {
    it(JSON.stringify(cond), async () => {
      await db.cols.card.find(cond, null, { limit: 5 }).catch((err) => {
        assert(err, 'Error should be thrown.')
      })
    })
  })
})

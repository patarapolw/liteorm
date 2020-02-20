import assert from 'assert'

import { db } from './0-create'

export default () => describe('readDatabase', () => {
  ;[
    {
      front: { $substr: 'Lorem' },
    },
    {
      v2b: 'is',
    },
    {
      v2b: ['is', 'am'],
    },
    {
      v2b: { $in: ['is', 'am'] },
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
      const count = await db.db.find(db.cols.card)(cond, [{ key: 'COUNT(*)', alias: 'count' }])
      assert(count[0].count > 0)

      // const result = await db.cols.card.find(cond, ['front', 'stat', 'nextReview', 'isCool', 'v2b'], {
      //   sort: {
      //     key: 'front',
      //     desc: true,
      //   },
      //   offset: 10,
      //   limit: 5,
      // })

      // console.dir(result, { depth: null })

      // db.cols.card.off('find', console.log)
    })
  })

  ;[
    {
      notExists: 'abc',
    },
  ].map((cond) => {
    it(JSON.stringify(cond), async () => {
      await db.db.find(db.cols.card)(cond, ['*'], { limit: 5 }).catch((err) => {
        assert(err, 'Error should be thrown.')
      })
    })
  })
})

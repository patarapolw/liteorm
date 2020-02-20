import assert from 'assert'

import { db } from './0-create'

export default () => describe('updateDatabase', () => {
  ;[
    { front: { $substr: 'Lorem' } },
    {
      'stat.streak.right': { $gt: 8 },
    },
    {
      nextReview: { $gt: new Date(2029, 12) },
    },
  ].map((cond) => {
    it(JSON.stringify(cond), async () => {
      // db.cols.card.on('update', console.log)

      await db.db.update(db.cols.card)(cond, { front: 'NoNUM' })
      const r = await db.db.find(db.cols.card)(cond, ['front'])

      assert(r.every((r0) => r0.front === 'NoNUM'))

      // db.cols.card.off('update', console.log)
    })
  })
})

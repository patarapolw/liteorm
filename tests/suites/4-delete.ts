import assert from 'assert'

import { db } from './0-create'

export default () => describe('deleteDatabase', () => {
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
      await db.cols.card.delete(cond)
      const r = await db.cols.card.find(cond, ['ROWID'])
      assert(r.length === 0)
    })
  })
})

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
      await db.db.delete(db.cols.card)(cond)
      const r = await db.db.find(db.cols.card)(cond, ['ROWID'])
      assert(r.length === 0)
    })
  })
})

import assert from 'assert'

import { db, dbCard } from './0-create'

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
      await db.delete(dbCard)(cond)
      const count = await db.count(dbCard)(cond)
      assert(count === 0)
    })
  })
})

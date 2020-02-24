import assert from 'assert'

import SQL from 'sql-template-strings'

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
      const r = await db.first(dbCard)(cond, {
        count: SQL`COUNT (*)`,
      })
      assert(r!.count === 0)
    })
  })
})

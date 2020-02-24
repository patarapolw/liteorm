import assert from 'assert'

import { db, dbCard } from './0-create'

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

      await db.update(dbCard)(cond, { front: 'NoNUM' })
      const r = await db.find(dbCard)(cond, {
        front: dbCard.c.front,
      })

      assert((await r.all()).every((r0) => r0.front === 'NoNUM'))

      // db.cols.card.off('update', console.log)
    })
  })
})

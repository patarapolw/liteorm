import assert from 'assert'

import { db, dbNote, dbCard } from './0-create'

export default () => describe('chainDatabase', () => {
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
      const r = await db.all(dbCard, {
        from: dbCard.c.noteId,
        to: dbNote,
      })(
        cond,
        {
          front: dbCard.c.front,
          stat: dbCard.c.stat,
          nextReview: dbCard.c.nextReview,
        },
        {
          sort: {
            key: dbCard.c.front,
            desc: true,
          },
          offset: 10,
          limit: 5,
        },
      )

      assert(r.length > 0)
    })
  })
})

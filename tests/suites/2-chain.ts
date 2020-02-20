import assert from 'assert'

import { db } from './0-create'

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
      const r = await db.db.find(db.cols.note, {
        from: {
          table: db.cols.note,
        },
        to: {
          table: db.cols.card,
          key: 'noteId',
        },
      })(
        cond, ['front', 'stat', 'nextReview'], {
          sort: {
            table: db.cols.card,
            key: 'front',
            desc: true,
          },
          offset: 10,
          limit: 5,
        })

      assert(r.length > 0)
    })
  })
})

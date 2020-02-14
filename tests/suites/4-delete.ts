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
      console.dir(await db.cols.card.delete(cond), { depth: null })
      console.dir(await db.cols.card.find(cond, ['front', 'stat', 'nextReview'], {
        sort: {
          key: 'front',
          desc: true,
        },
      }), { depth: null })
    })
  })
})

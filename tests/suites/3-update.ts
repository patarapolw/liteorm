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

      console.dir(await db.cols.card.update(cond, { front: 'NoNUM' }), { depth: null })
      console.dir(await db.cols.card.find(cond, ['front', 'stat', 'nextReview'], {
        sort: {
          key: 'front',
          desc: true,
        },
        offset: 10,
        limit: 5,
      }), { depth: null })

      // db.cols.card.off('update', console.log)
    })
  })
})

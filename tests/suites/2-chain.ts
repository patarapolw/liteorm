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
      const chained = db.cols.card.chain(['noteId', 'front', 'stat', 'nextReview'])
      // chained.on('data', (sql) => console.log(sql))

      console.dir(await chained
        .join(db.cols.note, 'noteId', '_id', ['data'])
        .data(cond, {
          sort: {
            key: 'card__front',
            desc: true,
          },
          offset: 10,
          limit: 5,
        }), { depth: null })
    })
  })
})

import fs from 'fs'

import { createDatabase, db } from './suites/0-create'
import read from './suites/1-read'
import chain from './suites/2-chain'
import update from './suites/3-update'
import doDelete from './suites/4-delete'

describe('CRUD', function () {
  this.timeout('1min')

  before(async () => {
    await createDatabase()
  })

  read()
  chain()
  update()
  doDelete()
})

after(async () => {
  await db.db.close()
  // fs.unlinkSync('tests/test.db')
})

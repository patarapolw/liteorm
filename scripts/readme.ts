import crypto from 'crypto'

import { Db, Table, Collection, primary, prop } from '../src'

@Table({ name: 'deck' })
class DbDeck {
  @primary({ autoincrement: true }) _id?: number
  @prop({ unique: true }) name!: string
}

const dbDeck = Collection.make(DbDeck)

@Table({ name: 'source' })
class DbSource {
  @primary({ autoincrement: true }) _id?: number
  @prop({ unique: true }) h!: string
  @prop() name!: string
  @prop() created!: Date
}

const dbSource = Collection.make(DbSource)

@Table({ name: 'template', unique: [['front', 'back', 'css', 'js']] })
class DbTemplate {
  @primary({ autoincrement: true }) _id?: number
  @prop() name!: string
  @prop({ references: dbSource, null: true }) sourceId?: number
  @prop() front!: string
  @prop({ null: true }) back?: string
  @prop({ null: true }) css?: string
  @prop({ null: true }) js?: string
}

const dbTemplate = Collection.make(DbTemplate)

@Table({ name: 'note' })
class DbNote {
  @primary({ autoincrement: true }) _id?: number
  @prop({ unique: true }) key?: string
  @prop() name!: string
  @prop({ references: dbSource, null: true }) sourceId?: number
  @prop() data!: Record<string, any>
  @prop() order!: Record<string, number>
}

const dbNote = Collection.make(DbNote)

@Table({ name: 'media' })
class DbMedia {
  @primary({ autoincrement: true }) _id?: number
  @prop({ unique: true }) h?: string
  @prop({ references: dbSource, null: true }) sourceId?: number
  @prop() name!: string
  @prop() data!: ArrayBuffer
}

const dbMedia = Collection.make(DbMedia)

@Table({ name: 'card' })
class DbCard {
  @primary() _id!: string
  @prop({ references: dbDeck }) deckId!: number
  @prop({ references: dbTemplate, null: true }) templateId?: number
  @prop({ references: dbNote, null: true }) noteId?: number
  @prop() front!: string
  @prop({ null: true }) back?: string
  @prop({ null: true }) mnemonic?: string
  @prop({ null: true }) srsLevel?: number
  @prop({ null: true }) nextReview?: Date
  @prop({ null: true }) tag?: string[]
  @prop() created!: Date
  @prop({ null: true }) modified?: Date
  @prop({ null: true }) stat?: {
    streak: { right: number; wrong: number }
  }
}

const dbCard = Collection.make(DbCard)

;(async () => {
  const db = await Db.connect('test.db')

  Collection.init(db, [dbDeck, dbSource, dbTemplate, dbNote, dbMedia, dbCard])

  dbNote.on('pre-create', async (p) => {
    if (!p.entry.key) {
      p.entry.key = await new Promise((resolve, reject) => {
        crypto.randomBytes(48, (err, buffer) => {
          err ? reject(err) : resolve(buffer.toString('base64'))
        })
      })
    }
  })
})().catch(console.error)

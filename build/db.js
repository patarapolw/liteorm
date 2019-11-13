"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("bluebird-global");
const sqlite_1 = __importDefault(require("sqlite"));
const collection_1 = require("./collection");
class Db {
    constructor(params) {
        this.cols = {};
        this.sql = params.sql;
        this.filename = params.filename;
    }
    static async connect(filename, options) {
        const sql = await sqlite_1.default.open(filename, options);
        return new Db({ sql, filename });
    }
    async collection(model) {
        const col = new collection_1.Collection(this.sql, model);
        await col.build();
        this.cols[col.name] = col;
        return col;
    }
    async close() {
        await this.sql.close();
        return this;
    }
}
exports.Db = Db;

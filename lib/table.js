"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._transformers = exports.Table = exports.Column = void 0;
const emittery_1 = __importDefault(require("emittery"));
const utils_1 = require("./utils");
class Column {
    constructor(opts) {
        this.opts = opts;
    }
    get tableName() {
        return this.opts.table.m.__meta.name;
    }
    get name() {
        return this.opts.name;
    }
}
exports.Column = Column;
class Table extends emittery_1.default.Typed {
    constructor(M) {
        super();
        this.m = new M();
        if (this.m.__meta.createdAt) {
            this.m.__meta.prop.createdAt = { type: 'Date', null: false, default: () => new Date() };
        }
        if (this.m.__meta.updatedAt) {
            this.m.__meta.prop.updatedAt = {
                type: 'Date',
                null: false,
                onChange: () => new Date(),
            };
        }
        this.c = Object.entries(this.m.__meta.prop).map(([k, v]) => {
            if (v) {
                return [k, new Column({
                        name: k,
                        table: this,
                        prop: v,
                    })];
            }
            return null;
        }).filter((el) => el)
            .reduce((prev, [k, v]) => ({ ...prev, [k]: v }), {});
        this.c[this.primaryKey] = new Column({
            name: this.primaryKey,
            table: this,
            prop: this.m.__meta.primary,
        });
        Object.entries(this.m.__meta.prop).map(([k, v]) => {
            if (v) {
                const { default: def, onChange, onUpdate } = v;
                if (typeof def === 'function' || onChange !== undefined) {
                    const fn = def || onChange;
                    this.on('pre-create', async ({ entry }) => {
                        if (utils_1.isNullOrUndefined(entry[k])) {
                            entry[k] = typeof fn === 'function' ? await fn(entry) : fn;
                        }
                    });
                }
                if (onUpdate !== undefined || onChange !== undefined) {
                    const fn = onUpdate !== undefined ? onUpdate : onChange;
                    this.on('pre-update', async ({ set }) => {
                        /**
                         * NULL should be able to set SQLite row to BLANK
                         */
                        if (set[k] === undefined) {
                            set[k] = typeof fn === 'function' ? await fn(set) : fn;
                        }
                    });
                }
            }
        });
    }
    get primaryKey() {
        return this.m.__meta.primary && typeof this.m.__meta.primary.name === 'string' ? this.m.__meta.primary.name : 'ROWID';
    }
    get name() {
        return this.m.__meta.name;
    }
    async __init(db) {
        const getDefault = (k, v) => {
            if (utils_1.isNullOrUndefined(v.default)) {
                return '';
            }
            else if (v.default instanceof utils_1.RawSQL) {
                return `DEFAULT ${v.default.content}`;
            }
            else if (typeof v.default === 'string') {
                return `DEFAULT '${v.default.replace(/'/, "[']")}'`;
            }
            else if (typeof v.default === 'number') {
                return `DEFAULT ${v.default}`;
            }
            else if (typeof v.default === 'boolean') {
                return `DEFAULT ${v.default ? 1 : 0}`;
            }
            return '';
        };
        const cols = [];
        if (this.m.__meta.primary && this.m.__meta.primary.type) {
            cols.push([
                utils_1.safeColumnName(this.m.__meta.primary.name),
                utils_1.AliasToSqliteType[this.m.__meta.primary.type] || 'INTEGER',
                'PRIMARY KEY',
                ...(this.m.__meta.primary.autoincrement ? [
                    'AUTOINCREMENT',
                ] : []),
                getDefault(this.m.__meta.primary.name, this.m.__meta.primary),
            ].join(' '));
        }
        for (const [k, v] of Object.entries(this.m.__meta.prop)) {
            if (v && v.type) {
                cols.push([
                    utils_1.safeColumnName(k),
                    utils_1.AliasToSqliteType[v.type] || 'TEXT',
                    ...(v.null ? [] : [
                        'NOT NULL',
                    ]),
                    ...(v.collate ? [
                        `COLLATE ${v.collate}`
                    ] : []),
                    getDefault(k, v),
                    ...(v.references ? [
                        `REFERENCES ${utils_1.safeColumnName(v.references)}`,
                    ] : []),
                ].join(' '));
            }
        }
        if (this.m.__meta.primary && Array.isArray(this.m.__meta.primary.name)) {
            cols.push(`PRIMARY KEY (${this.m.__meta.primary.name.map((k) => utils_1.safeColumnName(k)).join(',')})`);
        }
        if (this.m.__meta.unique && this.m.__meta.unique.length > 0) {
            this.m.__meta.unique.forEach((ss) => {
                cols.push(`CONSTRAINT ${utils_1.safeColumnName(ss.name)} UNIQUE (${ss.keys.map((k) => utils_1.safeColumnName(k)).join(',')})`);
            });
        }
        for (const [k, v] of Object.entries(this.m.__meta.prop)) {
            if (v && v.unique) {
                cols.push(`CONSTRAINT ${utils_1.safeColumnName(v.unique)} UNIQUE (${utils_1.safeColumnName(k)})`);
            }
        }
        const stmt = `CREATE TABLE IF NOT EXISTS ${utils_1.safeColumnName(this.m.__meta.name)} (${cols.join(',')}) ${this.m.__meta.withoutRowID ? 'WITHOUT ROWID' : ''}`;
        await this.emit('build-sql', { stmt });
        await new Promise((resolve, reject) => {
            db.run(stmt, (err) => err ? reject(err) : resolve());
        });
        if (this.m.__meta.index) {
            await Promise.all(this.m.__meta.index.map(async (idx) => {
                const stmt = `CREATE INDEX IF NOT EXISTS ${utils_1.safeColumnName(idx.name)} ON ${this.m.__meta.name} (${idx.keys.map((k) => utils_1.safeColumnName(k)).join(',')})`;
                await this.emit('build-sql', { stmt });
                await new Promise((resolve, reject) => {
                    db.run(stmt, (err) => err ? reject(err) : resolve());
                });
            }));
        }
        for (const [k, v] of Object.entries(this.m.__meta.prop)) {
            if (v && v.index) {
                const stmt = `CREATE INDEX IF NOT EXISTS ${utils_1.safeColumnName(v.index)} ON ${utils_1.safeColumnName(this.m.__meta.name)} (${utils_1.safeColumnName(k)})`;
                await this.emit('build-sql', { stmt });
                await new Promise((resolve, reject) => {
                    db.run(stmt, (err) => err ? reject(err) : resolve());
                });
            }
        }
    }
    create(db) {
        return async (entry, options = {}) => {
            const postfix = options.postfix ? [options.postfix] : [];
            const params = new utils_1.SQLParams();
            if (options.ignoreErrors) {
                postfix.push(`ON CONFLICT DO NOTHING`);
            }
            await this.emit('pre-create', { entry, options: { postfix } });
            const keys = [];
            const values = [];
            for (const [k, v] of Object.entries(entry)) {
                if (typeof v !== 'undefined') {
                    keys.push(k);
                    values.push(this.transform(k, 'set')(v));
                }
            }
            const stmt = `INSERT INTO ${utils_1.safeColumnName(this.m.__meta.name)} (${keys.map((k) => utils_1.safeColumnName(k)).join(',')}) VALUES (${values.map((v) => params.add(v))}) ${postfix.join(' ')}`;
            await this.emit('create-sql', { stmt, params });
            return new Promise((resolve, reject) => {
                db.run(stmt, params.data, function (err) { err ? reject(err) : resolve(this.lastID); });
            });
        };
    }
    __updateBySql(db) {
        return async (stmt, params, set) => {
            await this.emit('pre-update', { stmt, params, set });
            const setSql = [];
            for (const [k, v] of Object.entries(set)) {
                if (typeof v !== 'undefined') {
                    setSql.push(`${utils_1.safeColumnName(k)} = ${params.add(this.transform(k, 'set')(v))}`);
                }
            }
            const resultSql = `UPDATE ${utils_1.safeColumnName(this.name)} SET ${setSql.join(',')} WHERE ${utils_1.safeColumnName(this.primaryKey)} IN (${stmt})`;
            await this.emit('update-sql', { stmt: resultSql, params });
            await new Promise((resolve, reject) => {
                db.run(resultSql, params.data, function (err) { err ? reject(err) : resolve(); });
            });
        };
    }
    __deleteBySql(db) {
        return async (stmt, params) => {
            await this.emit('pre-delete', { stmt, params });
            const resultSql = `DELETE FROM ${utils_1.safeColumnName(this.name)} WHERE ${utils_1.safeColumnName(this.primaryKey)} IN (${stmt})`;
            await this.emit('delete-sql', { stmt: resultSql, params });
            await new Promise((resolve, reject) => {
                db.run(resultSql, params.data, function (err) { err ? reject(err) : resolve(); });
            });
        };
    }
    /**
     * @internal
     * @param k
     * @param method
     */
    transform(k, method = 'set') {
        let fn = null;
        const prop = this.m.__meta.prop[k];
        if (prop) {
            if (prop.transform) {
                fn = prop.transform[method] || null;
            }
            if (!fn) {
                const t = exports._transformers[prop.type];
                if (t) {
                    fn = t[method] || null;
                }
            }
        }
        return fn || ((a) => a);
    }
}
exports.Table = Table;
exports._transformers = {
    Date: {
        get: (repr) => typeof repr === 'number' ? new Date(repr) : null,
        set: (d) => d ? d instanceof Date ? +d : +new Date(d) : null,
    },
    JSON: {
        get: (repr) => repr ? JSON.parse(repr) : null,
        set: (data) => data ? JSON.stringify(data) : null,
    },
    StringArray: {
        get: (repr) => (() => {
            repr = repr ? repr.substr(1, repr.length - 2) : '';
            return repr ? repr.split('\x1f') : null;
        })(),
        set: (d) => d ? '\x1f' + d.join('\x1f') + '\x1f' : null,
    },
    Boolean: {
        get: (repr) => typeof repr === 'number' ? repr !== 0 : null,
        set: (d) => typeof d === 'boolean' ? Number(d) : null,
    },
};
//# sourceMappingURL=table.js.map
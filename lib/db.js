"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Db = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const emittery_1 = __importDefault(require("emittery"));
const table_1 = require("./table");
const find_1 = require("./find");
const utils_1 = require("./utils");
try {
    require('bluebird-global');
}
catch (_) { }
class Db extends emittery_1.default.Typed {
    constructor(filename, options) {
        super();
        this.sql = typeof filename === 'string'
            ? new sqlite3_1.default.Database(filename, options)
            : filename;
    }
    /**
     * Initialize tables sequentially, just in case foreign keys matter
     *
     * @param tables
     */
    async init(tables) {
        for (const t of tables) {
            await t.__init(this.sql);
        }
    }
    create(table) {
        return table.create(this.sql);
    }
    each(table0, ...tables) {
        return (qCond, select, options = {}) => {
            return async (cb) => {
                return (await this._find(table0, ...tables)(qCond, select, options)).each(cb);
            };
        };
    }
    all(table0, ...tables) {
        return async (qCond, select, options = {}) => {
            return (await this._find(table0, ...tables)(qCond, select, options)).all();
        };
    }
    count(table0, ...tables) {
        return async (qCond) => {
            return (await this.first(table0, ...tables)(qCond, {
                count: utils_1.sql `COUNT (*)`,
            }) || {}).count || 0;
        };
    }
    first(table0, ...tables) {
        return async (qCond, select, options = {}) => {
            return (await (await this._find(table0, ...tables)(qCond, select, {
                ...options,
                limit: 1,
            })).all())[0];
        };
    }
    update(table0, ...tables) {
        return async (qCond, set, options = {}) => {
            await Promise.all((await this._findIds(table0, ...tables)(qCond, options)).map(async ({ sql: { stmt, params }, table, }) => {
                if (Array.isArray(set)) {
                    await Promise.all(set.filter((s) => s.table === table).map(async (s) => {
                        await table.__updateBySql(this.sql)(stmt, params, s.set);
                    }));
                }
                else {
                    await table.__updateBySql(this.sql)(stmt, params, set);
                }
            }));
        };
    }
    delete(table0, ...tables) {
        return async (qCond, options = {}) => {
            await Promise.all((await this._findIds(table0, ...tables)(qCond, options)).map(async ({ sql: { stmt, params }, table, }) => {
                await table.__deleteBySql(this.sql)(stmt, params);
            }));
        };
    }
    async close() {
        return new Promise((resolve, reject) => {
            this.sql.close((err) => err ? reject(err) : resolve());
        });
    }
    _find(table0, ...tables) {
        return async (qCond, select, options = {}) => {
            const tablesArray = tables.map((t) => t instanceof table_1.Table ? { to: t } : t);
            await this.emit('pre-find', {
                cond: qCond,
                select: select === '*' ? table0.c : select,
                tables: tablesArray,
                options,
            });
            const selectDict = Object.entries(select === '*' ? table0.c : select).map(([alias, col]) => {
                const key = col instanceof table_1.Column
                    ? utils_1.safeColumnName(`${col.tableName}.${col.name}`)
                    : col instanceof utils_1.RawSQL
                        ? col.content : utils_1.safeColumnName(col);
                return [alias, {
                        key,
                        column: col instanceof table_1.Column ? col : undefined,
                    }];
            }).reduce((prev, [a, k]) => ({ ...prev, [a]: k }), {});
            const tableRecord = [
                table0,
                ...tables.map((t) => t instanceof table_1.Table
                    ? t
                    : t.to instanceof table_1.Table ? t.to : t.to.opts.table),
            ].reduce((prev, t) => ({ ...prev, [t.m.__meta.name]: t }), {});
            const postfix = options.postfix ? [options.postfix] : [];
            if (options.sort) {
                postfix.push(`ORDER BY ${utils_1.safeColumnName(typeof options.sort.key === 'string' ? options.sort.key : `${options.sort.key.tableName}.${options.sort.key.name}`)} ${options.sort.desc ? 'DESC' : 'ASC'}`);
            }
            if (options.limit) {
                postfix.push(`LIMIT ${options.limit}`);
            }
            if (options.offset) {
                postfix.push(`OFFSET ${options.offset}`);
            }
            const params = new utils_1.SQLParams();
            const stmt = [
                `SELECT ${selectDict ? Object.entries(selectDict).map(([a, k]) => {
                    return k.key === a ? k.key : `${k.key} AS ${utils_1.safeColumnName(a)}`;
                }).join(',') : select}`,
                `FROM ${utils_1.safeColumnName(table0.m.__meta.name)}`,
                ...tablesArray.map((t) => {
                    const toTable = t.to instanceof table_1.Table ? t.to : t.to.opts.table;
                    if (t.from) {
                        return [
                            `${t.type || 'INNER'} JOIN ${utils_1.safeColumnName(toTable.m.__meta.name)}`,
                            'ON',
                            utils_1.safeColumnName(`${t.from.tableName}.${t.from.name}`),
                            '=',
                            utils_1.safeColumnName(t.to instanceof table_1.Table
                                ? `${toTable.m.__meta.name}.${toTable.primaryKey}`
                                : `${toTable.m.__meta.name}.${t.to.name}`),
                        ].join(' ');
                    }
                    else if (t.cond) {
                        return [
                            `${t.type || 'INNER'} JOIN ${utils_1.safeColumnName(toTable.m.__meta.name)}`,
                            'ON',
                            `(${t.cond})`,
                        ].join(' ');
                    }
                    else {
                        return `${t.type || 'NATURAL'} JOIN ${utils_1.safeColumnName(toTable.m.__meta.name)}`;
                    }
                }),
                `WHERE ${find_1.parseCond(qCond, tableRecord, params)}`,
                ...postfix,
            ].join(' ');
            await this.emit('find-sql', { stmt, params });
            const parseNative = (r) => {
                Object.entries(r).map(([alias, v]) => {
                    if (selectDict && selectDict[alias] && selectDict[alias].column) {
                        const col = selectDict[alias].column;
                        r[alias] = col.opts.table.transform(col.name, 'get')(v);
                    }
                });
                return r;
            };
            return {
                sql: {
                    stmt,
                    params,
                },
                each: (cb) => {
                    return new Promise((resolve, reject) => {
                        this.sql.each(stmt, params.data, (err, r) => {
                            err ? reject(err) : cb(parseNative(r));
                        }, (err, completion) => {
                            err ? reject(err) : resolve(completion);
                        });
                    });
                },
                all: async () => {
                    return new Promise((resolve, reject) => {
                        this.sql.all(stmt, params.data, (err, data) => {
                            err ? reject(err) : resolve(data.map((r) => parseNative(r)));
                        });
                    });
                },
            };
        };
    }
    _findIds(table0, ...tables) {
        return async (qCond, options = {}) => {
            const tt = [
                table0,
                ...tables.map((t) => t instanceof table_1.Table
                    ? t
                    : t.to instanceof table_1.Table
                        ? t.to : t.to.opts.table),
            ];
            return Promise.all(tt.map(async (t) => {
                return {
                    sql: (await this._find(table0, ...tables)(qCond, {
                        [`${t.m.__meta.name}__id`]: new table_1.Column({
                            name: t.primaryKey,
                            table: t,
                            prop: t.m.__meta.primary,
                        }),
                    }, options)).sql,
                    table: t,
                };
            }));
        };
    }
}
exports.Db = Db;
//# sourceMappingURL=db.js.map
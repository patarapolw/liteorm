"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const emittery_1 = __importDefault(require("emittery"));
const cond_1 = __importDefault(require("./cond"));
class Collection extends emittery_1.default.Typed {
    constructor(db, model) {
        super();
        const { name, primary, unique, prop } = model.__meta;
        this.db = db;
        this.name = name;
        const fields = [];
        if (primary.name) {
            if (Array.isArray(primary.name)) {
                fields.push(...primary.name);
            }
            else {
                fields.push(primary.name);
            }
        }
        fields.push(...Object.keys(prop));
        this.__meta = {
            primary,
            prop,
            fields,
            unique,
            transform: {
                datetime: {
                    get: (repr) => repr ? new Date(repr) : null,
                    set: (data) => data ? data.toISOString() : null
                },
                JSON: {
                    get: (repr) => repr ? JSON.parse(repr) : null,
                    set: (data) => data ? JSON.stringify(data) : null
                }
            }
        };
    }
    async build() {
        const typeMap = {
            string: "TEXT",
            integer: "INTEGER",
            float: "FLOAT",
            binary: "BLOB",
            datetime: "TEXT",
            JSON: "TEXT"
        };
        const col = [];
        if (this.__meta.primary.type) {
            col.push([
                `"${this.__meta.primary.name}"`,
                typeMap[this.__meta.primary.type] || "INTEGER",
                "PRIMARY KEY",
                this.__meta.primary.autoincrement ? "AUTOINCREMENT" : ""
            ].join(" "));
        }
        for (const [k, v] of Object.entries(this.__meta.prop)) {
            if (v && v.type) {
                let def = undefined;
                if (v.default) {
                    def = this.transformEntry({ [k]: v.default })[k];
                }
                col.push([
                    `"${k}"`,
                    typeMap[v.type] || "INTEGER",
                    v.unique ? "UNIQUE" : "",
                    v.null ? "" : "NOT NULL",
                    def !== undefined ? (typeof def === "string" ? `DEFAULT '${def.replace("'", "[']")}'` : `DEFAULT ${def}`) : "",
                    v.references ? `REFERENCES "${v.references}"` : ""
                ].join(" "));
            }
        }
        if (Array.isArray(this.__meta.primary.name)) {
            col.push([
                "PRIMARY KEY",
                `(${this.__meta.primary.name.join(",")})`
            ].join(" "));
        }
        if (this.__meta.unique && this.__meta.unique.length > 0) {
            this.__meta.unique.forEach((ss) => {
                col.push([
                    "UNIQUE",
                    `(${ss.join(",")})`
                ].join(" "));
            });
        }
        const sql = {
            statement: `CREATE TABLE IF NOT EXISTS "${this.name}" (${col.join(",")})`,
            params: []
        };
        await this.emit("build", sql);
        await this.db.exec(sql.statement);
        return this;
    }
    async create(entry, ignoreErrors = false) {
        await this.emit("pre-create", { entry, ignoreErrors });
        const bracketed = [];
        const values = [];
        for (let [k, v] of Object.entries(entry)) {
            const prop = this.__meta.prop[k];
            if (prop && prop.type) {
                const tr = this.__meta.transform[prop.type];
                if (tr) {
                    v = tr.set(v);
                }
            }
            bracketed.push(k);
            values.push(v);
        }
        const sql = {
            statement: `
      INSERT INTO "${this.name}" (${bracketed.map((el) => `"${el}"`).join(",")})
      VALUES (${values.map((_) => "?").join(",")})
      ${ignoreErrors ? "ON CONFLICT DO NOTHING" : ""}`,
            params: values
        };
        await this.emit("create", sql);
        const r = await this.db.run(sql.statement, ...sql.params);
        return r.lastID;
    }
    async find(cond, fields, postfix) {
        await this.emit("pre-find", { cond, fields, postfix });
        const where = cond_1.default(cond);
        const selectClause = [];
        if (!fields) {
            selectClause.push("*");
        }
        else {
            fields.forEach((f) => {
                const fn = f.split(".");
                if (this.__meta.fields.includes(fn[0])) {
                    selectClause.push(f);
                }
            });
        }
        const sql = {
            statement: `
      SELECT ${selectClause.join(",")}
      FROM "${this.name}"
      ${where ? `WHERE ${where.clause}` : ""} ${postfix || ""}`,
            params: where ? where.params.map((el) => el === undefined ? null : el) : []
        };
        await this.emit("find", sql);
        const r = (await this.db.all(sql.statement, ...sql.params)).map((el) => this.loadData(el));
        return r;
    }
    async get(cond, fields) {
        return (await this.find(cond, fields, "LIMIT 1"))[0] || null;
    }
    async update(cond, set) {
        await this.emit("pre-update", { cond, set });
        const setK = [];
        const setV = [];
        const where = cond_1.default(cond);
        for (let [k, v] of Object.entries(set)) {
            const prop = this.__meta.prop[k];
            if (prop) {
                const { type } = prop;
                const tr = type ? this.__meta.transform[type] : undefined;
                if (tr) {
                    v = tr.set(v);
                }
                setK.push(`"${k}" = ?`);
                setV.push(v);
            }
        }
        const sql = {
            statement: `
      UPDATE "${this.name}"
      SET ${setK.join(",")}
      ${where ? `WHERE ${where.clause}` : ""}`,
            params: [
                ...setV,
                ...(where ? where.params.map((el) => el === undefined ? null : el) : [])
            ]
        };
        await this.emit("update", sql);
        await this.db.run(sql.statement, ...sql.params);
    }
    async delete(cond) {
        await this.emit("pre-delete", { cond });
        const where = cond_1.default(cond);
        const sql = {
            statement: `
      DELETE FROM "${this.name}"
      ${where ? `WHERE ${where.clause}` : ""}`,
            params: (where ? where.params.map((el) => el === undefined ? null : el) : [])
        };
        await this.emit("delete", sql);
        await this.db.run(sql.statement, ...sql.params);
    }
    chain(select) {
        return new Chain(this, select);
    }
    loadData(data) {
        for (const [k, v] of Object.entries(data)) {
            const prop = this.__meta.prop[k];
            if (prop && prop.type) {
                const tr = this.__meta.transform[prop.type];
                if (tr) {
                    data[k] = tr.get(v);
                }
            }
        }
        return data;
    }
    transformEntry(entry) {
        const output = {};
        for (let [k, v] of Object.entries(entry)) {
            const prop = this.__meta.prop[k];
            if (prop && prop.type) {
                const tr = this.__meta.transform[prop.type];
                if (tr) {
                    output[k] = tr.set(v);
                }
            }
            if (output[k] === undefined) {
                output[k] = v;
            }
        }
        return output;
    }
}
exports.Collection = Collection;
class Chain {
    constructor(firstCol, firstSelect) {
        this.cols = {};
        this.select = {};
        this.from = [];
        this.cols[firstCol.name] = firstCol;
        this.firstCol = firstCol;
        if (firstSelect) {
            if (Array.isArray(firstSelect)) {
                for (const l of firstSelect) {
                    this.select[`"${firstCol.name}"."${l}"`] = `${firstCol.name}__${l}`;
                }
            }
            else {
                for (const [l, v] of Object.entries(firstSelect)) {
                    this.select[`"${firstCol.name}"."${l}"`] = v;
                }
            }
        }
        this.from.push(`FROM "${firstCol.name}"`);
    }
    get db() {
        return this.firstCol.db;
    }
    join(to, foreignField, localField = "_id", select, type) {
        if (select) {
            if (Array.isArray(select)) {
                for (const l of select) {
                    this.select[`"${to.name}"."${l}"`] = `${to.name}__${l}`;
                }
            }
            else {
                for (const [l, v] of Object.entries(select)) {
                    this.select[`"${to.name}"."${l}"`] = v;
                }
            }
        }
        this.from.push(`${type || ""} JOIN "${to.name}" ON "${foreignField}" = "${to.name}".${localField}`);
        this.cols[to.name] = to;
        return this;
    }
    sql(cond, postfix) {
        const where = cond ? cond_1.default(cond) : null;
        return {
            statement: `
      SELECT ${Object.entries(this.select).map(([k, v]) => `${k} AS "${v}"`).join(",")}
      ${this.from.join("\n")}
      ${where ? `WHERE ${where.clause}` : ""}
      ${postfix || ""}`,
            params: where ? where.params : []
        };
    }
    async data(cond, postfix) {
        const sql = this.sql(cond, postfix);
        return (await this.db.all(sql.statement, sql.params)).map((c) => {
            return this.transformRow(c);
        });
    }
    transformRow(row) {
        const item = {};
        for (const [k, v] of Object.entries(row)) {
            const [tableName, r] = k.split("__");
            const prop = this.cols[tableName].__meta.prop[r];
            if (prop && prop.type) {
                const tr = this.cols[tableName].__meta.transform[prop.type];
                if (tr) {
                    item[tableName] = item[tableName] || {};
                    item[tableName][r] = tr.get(v);
                }
            }
            item[tableName] = item[tableName] || {};
            if (item[tableName][r] === undefined) {
                item[tableName][r] = v;
            }
        }
        return item;
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Entity = exports.prop = exports.primary = void 0;
require("reflect-metadata");
const table_1 = require("./table");
const utils_1 = require("./utils");
function primary(params = {}) {
    return function (target, key) {
        const t = Reflect.getMetadata('design:type', target, key);
        let type = params.type || t.name;
        type = utils_1.normalizeAlias(type);
        const name = toSnakeCase(params.name || key);
        const autoincrement = !!params.autoincrement;
        if (autoincrement) {
            type = 'int';
        }
        const primary = {
            name,
            type: type,
            autoincrement,
            default: autoincrement ? undefined : params.default,
            onUpdate: params.onUpdate,
            onChange: params.onChange,
        };
        Reflect.defineMetadata('sqlite:primary', primary, target);
    };
}
exports.primary = primary;
function prop(params = {}) {
    return function (target, key) {
        const t = Reflect.getMetadata('design:type', target, key);
        const name = toSnakeCase(params.name || key);
        const references = typeof params.references === 'string'
            ? params.references
            : params.references instanceof table_1.Table
                ? `${params.references.m.__meta.name}(${params.references.m.__meta.primary
                    ? String(params.references.m.__meta.primary.name)
                    : 'ROWID'})`
                : typeof params.references === 'object'
                    ? `${params.references.table.m.__meta.name}(${params.references.key})`
                    : undefined;
        let type = (typeof params.references === 'object'
            ? params.references instanceof table_1.Table
                ? (params.references.m.__meta.primary || {}).type
                : (params.references.table.m.__meta.prop[params.references.key] || {}).type
            : params.type || t.name) || 'INTEGER';
        type = utils_1.normalizeAlias(type);
        const prop = Reflect.getMetadata('sqlite:prop', target) || {};
        prop[name] = {
            type,
            unique: typeof params.unique === 'string'
                ? params.unique
                : params.unique ? name + '_unique_idx' : undefined,
            collate: params.collate,
            null: params.null ? params.null : false,
            index: typeof params.index === 'string'
                ? params.index
                : params.index ? name + '_idx' : undefined,
            references,
            default: params.default ? params.default : undefined,
            onUpdate: params.onUpdate,
            onChange: params.onChange,
            transform: params.transform,
        };
        Reflect.defineMetadata('sqlite:prop', prop, target);
    };
}
exports.prop = prop;
function Entity(params = {}) {
    return function (target) {
        let timestamp = {
            createdAt: false,
            updatedAt: false,
        };
        if (params.timestamp) {
            if (params.timestamp === true) {
                timestamp = {
                    createdAt: true,
                    updatedAt: true,
                };
            }
            else {
                Object.assign(timestamp, JSON.parse(JSON.stringify(params.timestamp)));
            }
        }
        const { createdAt, updatedAt } = timestamp;
        const name = toSnakeCase(params.name || target.constructor.name);
        const primary = Reflect.getMetadata('sqlite:primary', target.prototype) ||
            (params.primary ? { name: params.primary } : undefined);
        const prop = Reflect.getMetadata('sqlite:prop', target.prototype);
        const unique = params.unique ? params.unique.map((u) => {
            return Array.isArray(u) ? {
                name: u.join('_') + '_idx',
                keys: u,
            } : u;
        }) : undefined;
        const index = params.index ? params.index.map((u) => {
            return Array.isArray(u) ? {
                name: u.join('_') + '_idx',
                keys: u,
            } : u;
        }) : undefined;
        const __meta = {
            name,
            primary,
            prop,
            unique,
            index,
            createdAt,
            updatedAt,
            withoutRowID: params.withoutRowID || false
        };
        target.prototype.__meta = __meta;
    };
}
exports.Entity = Entity;
function toSnakeCase(s) {
    if (s.includes('_')) {
        return s;
    }
    const phrases = [];
    let word = '';
    s.split('').map((c) => {
        if (c.toLocaleUpperCase() === c) {
            if (word) {
                phrases.push(word);
                word = '';
            }
        }
        word += c;
    });
    if (word) {
        phrases.push(word);
    }
    return phrases.join('_');
}
//# sourceMappingURL=decorators.js.map
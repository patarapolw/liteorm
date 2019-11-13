"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const typeMap = {
    String: "string",
    Number: "integer",
    Date: "datetime",
    ArrayBuffer: "binary"
};
function primary(params = {}) {
    return function (target, key) {
        const t = Reflect.getMetadata("design:type", target, key);
        const type = params.type || (typeMap[t.name] || "integer");
        const name = params.name || key;
        const autoincrement = (params && params.autoincrement && type === "integer");
        const primary = {
            name,
            type: (type || typeMap[t.name] || "integer"),
            autoincrement: autoincrement !== undefined ? autoincrement : false
        };
        Reflect.defineMetadata("sqlite:primary", primary, target);
    };
}
exports.primary = primary;
function prop(params = {}) {
    return function (target, key) {
        const t = Reflect.getMetadata("design:type", target, key);
        const type = params.type || (typeMap[t.name] || "JSON");
        const name = params.name || key;
        const prop = Reflect.getMetadata("sqlite:prop", target) || {};
        prop[name] = {
            type,
            unique: (params && params.unique) ? params.unique : false,
            null: (params && params.null) ? params.null : false,
            references: (params && params.references) ? params.references : undefined,
            default: (params && params.default) ? params.default : undefined
        };
        Reflect.defineMetadata("sqlite:prop", prop, target);
    };
}
exports.prop = prop;
function Table(params = {}) {
    return function (target) {
        const name = params.name || target.constructor.name;
        const primary = Reflect.getMetadata("sqlite:primary", target.prototype) || (params.primary ? { name: params.primary } : {
            name: "_id",
            type: "integer",
            autoincrement: true
        });
        const prop = Reflect.getMetadata("sqlite:prop", target.prototype);
        const unique = params.unique;
        target.prototype.__meta = { name, primary, prop, unique };
    };
}
exports.Table = Table;

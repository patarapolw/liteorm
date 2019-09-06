import "reflect-metadata";
import { SqliteNative, SqliteExt, IPrimaryRow, IPropRow } from "./collection";

const typeMap: Record<string, SqliteNative | SqliteExt> = {
  String: "string",
  Number: "integer",
  Date: "datetime",
  ArrayBuffer: "binary"
};

export function primary(params: {
  name?: string, 
  type?: SqliteNative, 
  autoincrement?: boolean
} = {}): PropertyDecorator {
  return function(target, key) {
    const t = Reflect.getMetadata("design:type", target, key);

    const type = params.type || (typeMap[t.name] || "integer") as SqliteNative;
    const name = params.name || key as string;
    const autoincrement = (params && params.autoincrement && type === "integer");

    const primary: IPrimaryRow = {
      name,
      type: (type || typeMap[t.name] || "integer") as SqliteNative,
      autoincrement: autoincrement !== undefined ? autoincrement : false
    }

    Reflect.defineMetadata("sqlite:primary", primary, target);
  }
}

export function prop(params: {
  name?: string,
  type?: SqliteNative | SqliteExt,
  unique?: boolean,
  null?: boolean
  references?: string
  default?: string
} = {}): PropertyDecorator {
  return function(target, key) {
    const t = Reflect.getMetadata("design:type", target, key);

    const type = params.type || (typeMap[t.name] || "JSON");
    const name = params.name || key as string;

    const prop = Reflect.getMetadata("sqlite:prop", target) || {};

    prop[name] = {
      type,
      unique: (params && params.unique) ? params.unique : false,
      null: (params && params.null) ? params.null : false,
      references: (params && params.references) ? params.references : undefined,
      default: (params && params.default) ? params.default : undefined
    } as IPropRow;

    Reflect.defineMetadata("sqlite:prop", prop, target);
  }
}

export function Table<T>(params: {
  name?: string,
  primary?: Array<keyof T>,
  unique?: Array<keyof T>[]
} = {}): ClassDecorator {
  return function(target) {
    const name = params.name || target.constructor.name;
    const primary = Reflect.getMetadata("sqlite:primary", target.prototype) || (params.primary ? {name: params.primary} : {
      name: "_id",
      type: "integer",
      autoincrement: true
    });
    const prop = Reflect.getMetadata("sqlite:prop", target.prototype);
    const unique = params.unique;

    target.prototype.__meta = { name, primary, prop, unique };
  }
}
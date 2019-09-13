declare module "async-eventemitter" {
  import { EventEmitter } from "events";

  export type AsyncListener<T, R> = (data?: T, callback?: (result?: R) => void) => Promise<R> | void;
  export interface EventMap {
    [event: string]: AsyncListener<any, any>;
  }

  export default class AsyncEventEmitter<T extends EventMap> extends EventEmitter {
    emit<E extends keyof T>(event: E & string, ...args: Parameters<T[E]>): boolean;
    first<E extends keyof T>(event: E & string, listener: T[E]): this;
    at<E extends keyof T>(event: E & string, index: number, listener: T[E]): this;
    before<E extends keyof T>(event: E & string, target: T[E], listener: T[E]): this;
    after<E extends keyof T>(event: E & string, target: T[E], listener: T[E]): this;

    // https://github.com/andywer/typed-emitter/blob/master/index.d.ts
    addListener<E extends keyof T>(event: E & string, listener: T[E]): this;
    on<E extends keyof T>(event: E & string, listener: T[E]): this;
    once<E extends keyof T>(event: E & string, listener: T[E]): this;
    prependListener<E extends keyof T>(event: E & string, listener: T[E]): this;
    prependOnceListener<E extends keyof T>(event: E & string, listener: T[E]): this;

    removeAllListeners(event?: keyof T & string): this;
    removeListener<E extends keyof T>(event: E & string, listener: T[E]): this;

    eventNames(): Array<keyof T & string>;
    listeners<E extends keyof T>(event: E & string): Array<T[E]>;
    listenerCount(event: keyof T & string): number;

    getMaxListeners(): number;
    setMaxListeners(maxListeners: number): this;
  }
}

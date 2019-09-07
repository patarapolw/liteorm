declare module "async-eventemitter" {
  import { EventEmitter } from "events";

  type AsyncListener<T> = (data?: T, callback?: () => void) => any;
  type Arg1<T> = T extends (data: infer U, ...args: any[]) => any ? U : T;

  class AsyncEventEmitter<T extends Record<string | symbol, AsyncListener<any>>> extends EventEmitter {
    emit: <K extends keyof T>(event: K, data?: Arg1<T[K]>, callback?: () => void) => boolean;
    first<K extends keyof T>(event: K, listener: AsyncListener<Arg1<T[K]>>): any;
    at<K extends keyof T>(event: K, index: number, listener: AsyncListener<Arg1<T[K]>>): any;
    before<K extends keyof T>(event: K, 
      target: AsyncListener<Arg1<T[K]>>, listener: AsyncListener<Arg1<T[K]>>): any;
    after<K extends keyof T>(event: K, 
      target: AsyncListener<Arg1<T[K]>>, listener: AsyncListener<Arg1<T[K]>>): any;

    // https://github.com/andywer/typed-emitter/blob/master/index.d.ts
    addListener<E extends keyof T> (event: E, listener: T[E]): this
    on<E extends keyof T> (event: E, listener: T[E]): this
    once<E extends keyof T> (event: E, listener: T[E]): this
    prependListener<E extends keyof T> (event: E, listener: T[E]): this
    prependOnceListener<E extends keyof T> (event: E, listener: T[E]): this
  
    // @ts-ignore
    removeAllListeners<E extends keyof T> (event: E): this
    removeListener<E extends keyof T> (event: E, listener: T[E]): this
  
    // @ts-ignore
    eventNames (): (keyof T)[];
    listeners<E extends keyof T> (event: E): Function[]
    listenerCount<E extends keyof T> (event: E): number
  
    getMaxListeners (): number
    setMaxListeners (maxListeners: number): this
  }

  export default AsyncEventEmitter;  
}

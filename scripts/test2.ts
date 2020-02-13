import 'reflect-metadata'

function Table (): ClassDecorator {
  return function (target) {
    console.log(Reflect.getMetadata('prop', target.prototype))
  }
}

function prop (): PropertyDecorator {
  return function (target, key) {
    const meta = Reflect.getMetadata('prop', target) || {}
    meta[key] = { jell: true }
    Reflect.defineMetadata('prop', meta, target)
  }
}

@Table()
class Point {
  @prop() x: number = 1;
  @prop() y?: number;
}

new Point()

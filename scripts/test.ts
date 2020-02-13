import 'reflect-metadata'

function logType (target : any, key : string) {
  var t = Reflect.getMetadata('design:type', target, key)
  console.log(t.name)
  console.log(target.attr2)
}

class Demo {
  @logType // apply property decorator
  public attr1?: Demo[];

  public attr2 = 'yes';
}

new Demo()

import { ArrayShape, MapShape, SetShape } from './collection';
import { EnumShape } from './enum';
import { Equals } from './equals';
import { FunctionShape } from './function';
import { LiteralShape } from './literal';
import { AnyShape, BinaryShape, BoolShape, IntegerShape, NeverShape, NothingShape, NumberShape, StringShape, TimestampShape } from './primitive';
import { Shape } from './shape';
import { StructShape } from './struct';
import { UnionShape } from './union';
import { Value } from './value';
import { ShapeVisitor } from './visitor';

export type IsInstance<T extends Shape> = (a: any) => a is Value.Of<T>;
export namespace IsInstance {
  export function of<T extends Shape>(type: T, props?: IsInstanceProps): IsInstance<T> {
    return type.visit(new IsInstanceVisitor(), props);
  }
}

export interface IsInstanceProps {
  /**
   * Performs a deep check.
   * @default false
   */
  deep?: boolean;
}

export class IsInstanceVisitor implements ShapeVisitor<IsInstance<Shape>, IsInstanceProps> {
  public enumShape(shape: EnumShape<any, any>, _context: IsInstanceProps): IsInstance<Shape> {
    return (a => Object.values(shape.Values).indexOf(a) !== -1) as IsInstance<Shape>;
  }
  public arrayShape(shape: ArrayShape<Shape>, props: IsInstanceProps): IsInstance<Shape> {
    const isItem: IsInstance<Shape> = IsInstance.of(shape.Items, props);

    return ((a: any) => Array.isArray(a) ?
      a.filter(item => !isItem(item)).length === 0 :
      false
    ) as IsInstance<ArrayShape<Shape>>;
  }
  public binaryShape(_shape: BinaryShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => Buffer.isBuffer(a) || typeof a === 'string') as IsInstance<BinaryShape>;
  }
  public boolShape(_shape: BoolShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => typeof a === 'boolean') as IsInstance<BoolShape>;
  }
  public structShape(shape: StructShape, props: IsInstanceProps): IsInstance<Shape> {
    const fields = Object.entries(shape.Fields).map(([name, value]) => ({
      [name]: IsInstance.of(value, props)
    })).reduce((a, b) => ({...a, ...b}));
    return ((a: any) => {
      if (typeof a === 'object') {
        // structural typing - if it contains valid values for all the fields, then it is of that type
        for (const [fieldName, isField] of Object.entries(fields)) {
          const value = a[fieldName];
          if (!isField(value)) {
            return false;
          }
        }
        return true;
      } else {
        return false;
      }
    }) as IsInstance<typeof shape>;
  }
  public anyShape(_shape: AnyShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((_a: any) => true) as IsInstance<AnyShape>;
  }
  public functionShape(_shape: FunctionShape): IsInstance<Shape> {
    // TODO: what to do with functions? ignore for now
    return ((_a: any) => false) as IsInstance<FunctionShape>;
  }
  public integerShape(_shape: IntegerShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => typeof a === 'number') as IsInstance<FunctionShape>;
  }
  public literalShape(shape: LiteralShape<Shape, any>, props: IsInstanceProps): IsInstance<Shape> {
    const isEqual = Equals.of(shape.Type);
    const isType = IsInstance.of(shape.Type, props);
    return ((a: any) => isType(a) && isEqual(a, shape.Value)) as IsInstance<Shape>;
  }
  public mapShape(shape: MapShape<Shape>, _props: IsInstanceProps): IsInstance<Shape> {
    const isItem = IsInstance.of(shape.Items);
    return((a: any) => {
      if (typeof a === 'object') {
        return isMap(Object.entries(a));
      } else if (a instanceof Map) {
        return isMap(a.entries());
      }
      return false;
    }) as IsInstance<MapShape<Shape>>;

    function isMap(it: Iterable<[string, any]>) {
      for (const [key, value] of it) {
        if (typeof key !== 'string') {
          // only string keys allowed
          return false;
        }
        if (!isItem(value)) {
          return false;
        }
      }
      return true;
    }
  }
  public neverShape(_shape: NeverShape, _props: IsInstanceProps): IsInstance<Shape> {
    // nothing can ever be of the type `never`
    return ((_a: any) => false) as IsInstance<Shape>;
  }
  public nothingShape(_shape: NothingShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => a === undefined || a === null) as IsInstance<Shape>;
  }
  public numberShape(_shape: NumberShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => typeof a === 'number') as IsInstance<Shape>;
  }
  public setShape(shape: SetShape<Shape>, _props: IsInstanceProps): IsInstance<Shape> {
    const isItem = IsInstance.of(shape.Items);
    return ((a: any) => {
      if (a instanceof Set) {
        for (const item of a.values()) {
          if (!isItem(item)) {
            return false;
          }
        }
      }
      return false;
    }) as IsInstance<Shape>;
  }
  public stringShape(_shape: StringShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => typeof a === 'string') as IsInstance<Shape>;
  }
  public timestampShape(_shape: TimestampShape, _props: IsInstanceProps): IsInstance<Shape> {
    return ((a: any) => a instanceof Date) as IsInstance<Shape>;
  }
  public unionShape(shape: UnionShape<Shape[]>, props: IsInstanceProps): IsInstance<Shape> {
    const items = shape.Items.map(i => IsInstance.of(i, props));

    return ((a: any) => items.find(isItem => isItem(a)) !== undefined) as IsInstance<Shape>;
  }
}
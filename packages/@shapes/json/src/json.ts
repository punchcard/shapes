import { AnyShape, ArrayShape, BinaryShape, BoolShape, EnumShape, Equals, Fields, FunctionArgs, FunctionShape, HashSet, IntegerShape, IsInstance, isOptional, LiteralShape, Mapper, MapShape, NeverShape, NothingShape, NumberShape, SetShape, Shape, ShapeVisitor, StringShape, TimestampShape, StructShape, UnionShape, ValidatingMapper, Value } from '@shapes/core';

export type Tag = typeof Tag;
export const Tag = Symbol.for('@shapes/json.Json.Tag');

export namespace Json {
  export type From<T extends Shape, V extends Value.Of<T> | any> =
    T extends ArrayShape<infer I> ? {
      [i in keyof I]: From<I, V[Extract<keyof V, number>]>
    }[keyof I][] :
    T extends SetShape<infer I> ? {
      [i in keyof I]: From<I, V[Extract<keyof V, number>]>
    }[keyof I][] :
    T extends MapShape<infer I> ? Record<string, {
      [i in keyof I]: From<I, V[keyof V]>
    }[keyof I]> :
    T extends StructShape<infer M> ? {
      [f in keyof M]: From<M[f], V[Extract<f, keyof V>]>
    } :
    T extends TimestampShape ? string :
    V
  ;
  export type Of<T> =
    T extends StructShape<infer M> ? {
      [m in keyof Fields.Natural<M>]: Of<Fields.Natural<M>[m]>;
    } :
    // use the instance type if this type can be constructed (for class A extends Record({}) {})
    // support overriding the type of a value
    T extends AnyShape ? any :
    T extends BinaryShape ? string :
    T extends BoolShape ? boolean :
    T extends NothingShape ? undefined | null :
    T extends NumberShape ? number :
    T extends StringShape ? string :
    T extends TimestampShape ? Date :
    T extends UnionShape<infer I> ? {
      [i in Extract<keyof I, number>]: Of<I[i]>;
    }[Extract<keyof I, number>] :
    T extends LiteralShape<infer L, infer V> ? {
      [i in keyof L]: From<L, V>;
    }[keyof L] :
    T extends EnumShape<infer E> ? E[keyof E] :

    T extends ArrayShape<infer I> ? Of<I>[] :
    T extends MapShape<infer V> ? { [key: string]: Of<V>; } :
    T extends SetShape<infer I> ? Of<I>[] :

    T extends { [Tag]: infer V } ? V :
    never
    ;
}

export namespace Json {
  export interface MapperOptions {
    visitor?: MapperVisitor;
    validate?: boolean;
  }

  export function mapper<T extends Shape>(shape: T, options: MapperOptions = {}): Mapper<Value.Of<T>, Json.Of<T>> {
    let mapper = (shape as any).visit(options.visitor || new MapperVisitor());
    if (options.validate === true) {
      mapper = ValidatingMapper.of(shape as any, mapper);
    }

    if (isOptional(shape as any)) {
      return {
        read: (v: any) => {
          if (v === undefined || v === null) {
            return v;
          }
          return mapper.read(v);
        },
        write: (v: any) => {
          if (v === undefined || v === null) {
            return v;
          }
          return mapper.write(v);
        }
      };
    }

    return mapper;
  }

  export function asString<T, U>(mapper: Mapper<T, U>): Mapper<T, string> {
    return {
      read: s => mapper.read(JSON.parse(s)),
      write: v => JSON.stringify(mapper.write(v))
    };
  }

  export function stringifyMapper<T extends Shape>(type: T, options: MapperOptions = {}): Mapper<Value.Of<T>, string> {
    const m = mapper(type, options);
    return {
      read: (s: string) => m.read(JSON.parse(s)) as any,
      write: v => JSON.stringify(m.write(v))
    };
  }

  export function bufferMapper<T extends Shape>(type: T, options: MapperOptions = {}): Mapper<Value.Of<T>, Buffer> {
    const m = mapper(type, options);
    return {
      read: (s: Buffer) => m.read(JSON.parse(s.toString('utf8'))) as any,
      write: v => Buffer.from(JSON.stringify(m.write(v)), 'utf8')
    };
  }

  export class MapperVisitor implements ShapeVisitor<Mapper<any, any>> {
    public enumShape(shape: EnumShape<any, any>, context: undefined): Mapper<any, any> {
      const isInstance = IsInstance.of(shape);
      return {
        read: s => {
          if (isInstance(s)) {
            return s;
          } else {
            throw new Error(`expected a value of the enum, ${Object.values(shape.Values).join(',')}`);
          }
        },
        write: s => s
      };
    }
    public literalShape(shape: LiteralShape<Shape, any>, context: undefined): Mapper<any, any> {
      const valueMapper = shape.Type.visit(this, context) as Mapper<any, any>;
      const isEqual = Equals.of(shape.Type);
      const literalValue = valueMapper.write(shape.Value);
      return {
        read: (a: any) => {
          const v = valueMapper.read(a);
          if (!isEqual(a, shape.Value)) {
            throw new Error(`expected literal value: ${shape.Value}`);
          }
          return shape.Value;
        },
        write: () => literalValue
      };
    }
    public unionShape(shape: UnionShape<Shape[]>, context: undefined): Mapper<any, any> {
      const items = shape.Items.map(item => [
        IsInstance.of(item, { deep: true }),
        Json.mapper(item) as Mapper<any, any>
      ] as const);

      return {
        read: (a: any) => {
          for (const [_, mapper] of items) {
            // TODO: this approach sucks, e.g. timestamps collide with strings ...
            // TODO: should we encode union types in JSON like how Avro does?
            // TODO: should probably be a case by case basis, e.g. in GraphQL, we can't introduce extra layers for unions
            try {
              return mapper.read(a);
            } catch (err) {
              // no-op
            }
          }
          throw new Error(`expected a value of ${shape}, but got: ${a}`);
        },
        write: (value: any) => {
          for (const [isType, mapper] of items) {
            // TODO: this is expensive
            if (isType(value)) {
              return mapper.write(value as any);
            }
          }
          throw new Error(`expected one of union type: ${shape}, but got: ${value}`);
        }
      };
    }
    public neverShape(shape: NeverShape, context: undefined): Mapper<any, any> {
      throw new Error("NeverShape is not supported by JSON");
    }
    public functionShape(shape: FunctionShape<FunctionArgs, Shape>): Mapper<any, any> {
      throw new Error("FunctionShape is not supported by JSON");
    }
    public nothingShape(shape: NothingShape, context: undefined): Mapper<void, any> {
      return {
        read: (a: any) => {
          if (typeof a === 'undefined' || a === null) {
            return null;
          }
          throw new Error(`expected null or undefined, got ${typeof a}, ${a}`);
        },
        write: () => null
      };
    }
    public anyShape(shape: AnyShape, context: undefined): Mapper<any, any> {
      return {
        read: a => a,
        write: a => a
      };
    }
    public binaryShape(shape: BinaryShape, context: undefined): Mapper<Buffer, string> {
      return {
        read: (b: any) => {
          if (typeof b !== 'string') {
            throw new Error(`expected base64 encoded string for Binary Payload`);
          }
          return Buffer.from(b, 'base64');
        },
        write: (b: Buffer) => b.toString('base64')
      };
    }
    public arrayShape(shape: ArrayShape<any>): Mapper<any[], any[]> {
      const item = mapper(shape.Items, {
        visitor: this
      });
      return {
        write: (arr: any[]) => arr.map(i => item.write(i)),
        read: (arr: any[]) => arr.map(i => item.read(i)),
      };
    }
    public boolShape(shape: BoolShape): Mapper<boolean, boolean> {
      return {
        read: (b: any) => {
          if (typeof b !== 'boolean') {
            throw new Error(`expected boolean but got ${typeof b}`);
          }
          return b;
        },
        write: (b: boolean) => b
      };
    }
    public structShape(shape: StructShape<any>): Mapper<any, any> {
      const fields = Object.entries(shape.Fields)
        .map(([name, member]) => ({
          [name]: mapper((member as any), {
            visitor: this
          })
        }))
        .reduce((a, b) => ({...a, ...b}), {});

      return {
        read: (value: any) => {
          if (typeof value !== 'object') {
            throw new Error(`expected object but got ${typeof value}`);
          }
          const res: any = {};
          // TODO: optionals
          for (const [name, codec] of Object.entries(fields)) {
            res[name] = codec.read(value[name]);
          }
          return new (shape as any)(res);
        },
        write: (value: any) => {
          const res: any = {};
          // TODO: optionals
          for (const [name, codec] of Object.entries(fields)) {
            res[name] = codec.write(value[name]);
          }
          return res;
        }
      };
    }
    public mapShape(shape: MapShape<any>): Mapper<{[key: string]: any}, {[key: string]: any}> {
      const valueMapper = mapper(shape.Items, {
        visitor: this
      });

      return {
        read: (map: any) => {
          if (typeof valueMapper !== 'object') {
            throw new Error(`expected object but got ${typeof valueMapper}`);
          }
          const res: any = {};
          // TODO: optionals
          for (const [name] of Object.entries(map)) {
            res[name] = valueMapper.read(map[name]);
          }
          return res;
        },
        write: (map: any) => {
          const res: any = {};
          // TODO: optionals
          for (const [name] of Object.entries(map)) {
            res[name] = valueMapper.write(map[name]);
          }
          return res;
        }
      } as any;
    }
    public numberShape(shape: NumberShape): Mapper<number, number> {
      return {
        read: (n: any) => {
          if (typeof n !== 'number') {
            throw new Error(`expected number but got ${typeof n}`);
          }
          return n;
        },
        write: (n: number) => n
      };
    }
    public integerShape(shape: IntegerShape): Mapper<number, number> {
      return {
        read: (n: any) => {
          if (typeof n !== 'number') {
            throw new Error(`expected number but got ${typeof n}`);
          }
          if (n % 1 !== 0) {
            throw new Error(`expected integer, got: ${n}`);
          }
          return n;
        },
        write: (n: number) => n
      };
    }

    public setShape(shape: SetShape<any>): Mapper<Set<any>, any[]> {
      const item = mapper(shape.Items, {
        visitor: this
      });
      return {
        write: (arr: Set<any>) => Array.from(arr).map(i => item.write(i)),
        read: (arr: any[]) => {
          const set =
            shape.Items.Kind === 'stringShape'  ||
            shape.Items.Kind === 'numberShape'  ||
            shape.Items.Kind === 'integerShape' ||
            shape.Items.Kind === 'boolShape' ? new Set() : HashSet.of(shape.Items);
          arr.forEach(i => set.add(item.read(i)));
          return set;
        }
      };
    }
    public stringShape(shape: StringShape): Mapper<string, string> {
      return {
        read: (s: any) => {
          if (typeof s !== 'string') {
            throw new Error(`expected string but got ${typeof s}`);
          }
          return s;
        },
        write: (s: string) => s
      };
    }
    public timestampShape(shape: TimestampShape): Mapper<Date, string> {
      return {
        read: (d: any) => {
          if (typeof d !== 'string') {
            throw new Error(`expected string for timestamp, but got ${typeof d}`);
          }
          return new Date(Date.parse(d));
        },
        write: (d: Date) => d.toISOString()
      };
    }
  }
}

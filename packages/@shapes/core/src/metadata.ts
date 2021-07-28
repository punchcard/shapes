import 'reflect-metadata';

/**
 * Metadata extracted from a Class of a Class Member.
 */
export type Metadata = {
  [key in string | symbol]: any;
};

// tslint:disable: ban-types
export function getClassMetadata(target: Object): Metadata {
  return Reflect.getMetadataKeys(target)
    .map(k => ({ [k]: Reflect.getMetadata(k, target) }))
    .reduce((a, b) => ({...a, ...b}), {});
}

export function getPropertyMetadata(target: Object, key: string | symbol): Metadata {
  return Reflect.getMetadataKeys(target, key)
    .map(k => ({ [k]: Reflect.getMetadata(k, target, key) }))
    .reduce((a, b) => ({...a, ...b}), {});
}

export namespace Meta {
  export function get(target: any, keys?: string[]): Metadata {
    const meta = target[Decorated.Data] || {};

    if (keys) {
      return keys
        .filter(k => meta[k] !== undefined)
        .map(k => ({[k]: meta[k]}))
        .reduce((a, b) => ({...a, ...b}), {});
    }
    return meta;
  }

  /**
   * Applies a Trait to a Shape.
   *
   * @param shape target to apply Trait to.
   * @param metadata payload of metadata to merge into the shape's metadata store
   */
  export function apply<Target extends Object, M extends Metadata>(shape: Target, metadata: M): Apply<Target, M> {
    const mergedMetadata = mergeMetadataValue((shape as any)[Decorated.Data] || {}, metadata);

    // is this a really bad idea?
    const wrapper = new Proxy(shape, {
      get: (obj: any, prop) => {
        if (prop === Decorated.Data) {
          return mergedMetadata;
        } else {
          return obj[prop];
        }
      }
    });
    return wrapper as any;
  }

  /**
   * Merges two metadata values to support declaration merging.
   *
   * Logic is as follows:
   * * Primtiives are overwritten with the new value.
   * * Arrays are concatenated.
   * * Objects are combined recursively with this algorithm.
   *
   * @param a old metadata value
   * @param b new metadata value
   */
  export function mergeMetadataValue<A, B>(a: A, b: B) {
    if (Array.isArray(a) && Array.isArray(b)) {
      // collect arrays of meta data values, useful for things like validators
      return b.concat(a);
    } else if (typeof a === 'object' && typeof b === 'object') {
      a = {
        ...a
      };
      for (const [name, value] of Object.entries(b)) {
        if ((a as any)[name] !== undefined) {
          (a as any)[name] = mergeMetadataValue((a as any)[name], value);
        } else {
          (a as any)[name] = value;
        }
      }
      // merge the keys of objects, useful for constructing nested objects
      return {
        ...b,
        ...a
      };
    } else {
      return b; // overwrite by default? maybe the compiler can enforce invalid merges are impossible?
      // throw new Error(`cannot merge metadata values of type: (${typeof a} => ${typeof b})`);
    }
  }

  export type GetType<T> = T extends Decorated<infer T2, any> ? T2 : T;
  export type GetData<T, OrElse = {}> = T extends Decorated<any, infer D> ? D : OrElse;
  export type GetDataOrElse<T, OrElse> = GetData<T, OrElse>;
}

/**
 * Apply metadata to a Type.
 */
export type Apply<T, D> =
  T extends Decorated<infer T2, infer D2> ?
    T2 & Decorated<T2, D & D2> : // if we're applying to something with metadata, then augment the original type (T2), not T.
    T & Decorated<T, D> // first application, so safe to augment T
    ;

/**
 * Tags to maintain decorated type information.
 *
 * @typeparam T - type of decorated value, e.g. a `StringShape`.
 * @typeparam D - type of data applied to the type, `T`.
 */
export interface Decorated<T, D> {
  [Decorated.Type]?: T;
  [Decorated.Data]: D
}
export namespace Decorated {
  export const Data = Symbol.for('@shapes/core.Decorated.Data');
  export const Type = Symbol.for('@shapes/core.Decorated.Type');
}

// tslint:disable: ban-types
// tslint:disable: variable-name

type Is<T, K extends keyof T, V> =
  T[K] extends V ? K :
  ['expected a', V, 'type, but received', T[K], never]; // <- hacky way to provide better errors to consumers

// ordinary decorator that can be restricted to a property type
export function PropertyAnnotation<Prop>(f: (target: Object, propertyKey: string) => void): <T extends Object, K extends keyof T>(target: T, propertyKey: Is<T, K, Prop>) => void {
  return f as any;
}

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable tsdoc/syntax */
import { EnumTypeNode, GraphQLAST, InputTypeNode, InterfaceTypeNode, RequestTypeNodes, ReturnTypeNodes, TypeNode, UnionTypeNode } from './ast';
import { QueryCompiler } from './query';
import { RowLacks } from './util';

/**
 * A GraphQL Schema.
 */
export interface ShapeSchema<
  /**
   * Map of all types in the GraphQL Schema.
   */
  Graph extends GraphQLAST = GraphQLAST,
  /**
   * ID of the type which is the root of the Query API.
   */
  Query extends keyof Graph = keyof Graph,
  /**
   * ID of the type which is the root of the Mutation API.
   */
  Mutation extends keyof Graph | undefined = keyof Graph | undefined
> {
  /**
   * Map of all types in the GraphQL Schema.
   */
  readonly graph: Graph;

  /**
   * Compiler for constructing type-safe GraphQL queries.
   */
  readonly query: QueryCompiler<Graph, Extract<Graph[Query], TypeNode>>;
  /**
   * Compiler for constructing type-safe GraphQL mutations (if defined).
   */
  readonly mutation: Mutation extends keyof Graph ? QueryCompiler<Graph, Extract<Graph[Mutation], TypeNode>> : undefined;
}

/**
 * Chained builder for constructing a type-safe GraphQL schema in native TypeScript.
 */
export class ShapeSchemaBuilder<G extends GraphQLAST = {}> {
  public readonly graph: G;
  constructor(graph?: G) {
    this.graph = graph || {} as any;
  }

  /**
   * Finalizes the GraphQL Schema.
   *
   * ```ts
   * schemaBuilder.build({
   *   query: 'Query'
   * })
   * ```
   *
   * @param props - specify the root types for query and mutations.
   */
  public build<
    Q extends keyof G,
    M extends keyof G | undefined
  >(props: {
    /**
     * ID of the type which is the root of the Query API.
     */
    query: Q,
    /**
     * ID of the type which is the root of the Mutation API.
     *
     * @default undefined
     */
    mutation?: M
  }): ShapeSchema<G, Q, M> {
    return {
      graph: this.graph,
      mutation: (props.mutation ? new QueryCompiler(this.graph, this.graph[props.mutation!] as any) : undefined) as any,
      query: new QueryCompiler(this.graph, this.graph[props.query] as any)
    };
  }

  /**
   * Import another schema's type system into this one.
   *
   * ```ts
   * const otherSchema = new SchemaBuilder()
   *   .type({
   *      Animal: {
   *        fields: {
   *          id: gql.ID['!']
   *        }
   *      }
   *    })
   *   .build(..);
   *
   * schemaBuilder
   *   .import(otherSchema)
   *   .type(_ => ({
   *      Zoo: {
   *        fields: {
   *          animals: gql.List(_.Animal)
   *        }
   *      }
   *   }))
   * ```
   *
   * @param schema - other GraphQL schema to import.
   */
  public import<S2 extends {graph: GraphQLAST}>(schema: S2): ShapeSchemaBuilder<G & S2['graph']> {
    return new ShapeSchemaBuilder({
      ...this.graph,
      ...schema
    }) as any;
  }

  /**
   * Define interface types.
   *
   * Option 1 - a literal object for interfaces with no dependencies on any other types.
   * ```ts
   * schemaBuilder.interface({
   *   // name of the interface
   *   Animal: {
   *     // optionally specify names of other interfaces this interface extends
   *     extends: ['NameOfOtherInterface']
   *     // fields of the interface
   *     fields: {
   *       // scalar field
   *       id: gql.ID["!"],
   *
   *       // refer to 'self', i.e. the Animal type
   *       self: gql.Self
   *     }
   *   }
   * })
   * ```
   *
   * Option 2 - a function that accepts a reference to the other types in the schema.
   * ```ts
   * schemaBuilder.interface(_ => ({
   *   Animal: {
   *     // fields of the interface
   *     fields: {
   *       // scalar field
   *       id: gql.ID["!"],
   *
   *       // reference to another type in the schema
   *       otherType: _.OtherType
   *
   *       // refer to 'self', i.e. the Animal type
   *       self: gql.Self
   *     }
   *   }
   * }))
   * ```
   * @param interfaceDefinitions - interface object or a function returning interface definitions.
   */
  public interface<I extends InterfaceDefinitions<G>>(
    interfaceDefinitions: RowLacks<I, keyof G> | ((schema: G) => I)
  ): ShapeSchemaBuilder<G & {
    [ID in Extract<keyof I, string>]: InterfaceTypeNode<
      ID,
      (
        I[ID]['fields'] extends (...args: any[]) => ReturnTypeNodes ? ReturnType<I[ID]['fields']> :
        I[ID]['fields'] extends ReturnTypeNodes ? I[ID]['fields']:
        never
      ),
      I[ID]['extends'] extends (keyof G)[] ? I[ID]['extends'] : undefined
    >;
  }> {
    return new ShapeSchemaBuilder<any>({
      ...this.graph,
      ...(Object.entries(typeof interfaceDefinitions === 'function' ? interfaceDefinitions(this.graph) : interfaceDefinitions).map(([ID, interfaceDef]) => ({
        [ID]: new InterfaceTypeNode(ID, interfaceDef.fields, interfaceDef.extends)
      })).reduce((a, b) => ({...a, ...b}), {}))
    }) as any;
  }

  /**
   * Define a type.
   *
   * Option 1 - a literal object for types with no dependencies on any other types.
   * ```ts
   * schemaBuilder.type({
   *   // name of the interface
   *   Animal: {
   *     // optionally specify names of interfaces this type implements
   *     extends: ['NameOfOtherInterface']
   *     // fields of the interface
   *     fields: {
   *       // scalar field
   *       id: gql.ID["!"],
   *
   *       // refer to 'self', i.e. the Animal type
   *       self: gql.Self
   *     }
   *   }
   * })
   * ```
   *
   * Option 2 - a function that accepts a reference to the other types in the schema.
   * ```ts
   * schemaBuilder.type(_ => ({
   *   Animal: {
   *     // fields of the interface
   *     fields: {
   *       // scalar field
   *       id: gql.ID["!"],
   *
   *       // reference to another type in the schema
   *       otherType: _.OtherType
   *
   *       // refer to 'self', i.e. the Animal type
   *       self: gql.Self
   *     }
   *   }
   * }))
   * ```
   * @param typeDefinitions - type object or a function returning type definitions.
   */
  public type<I extends TypeDefinitions<G>>(
    typeDefinitions: RowLacks<I, keyof G> | ((schema: G) => I)
  ): ShapeSchemaBuilder<G & {
    [ID in keyof I]: ID extends string ? TypeNode<
      ID,
      I[ID]['fields'] extends (...args: any[]) => ReturnTypeNodes ?
        ReturnType<I[ID]['fields']> :
        Extract<I[ID]['fields'], ReturnTypeNodes>,
      I[ID]['implements'] extends (keyof G)[] ? I[ID]['implements'] : undefined
    > : never;
  }> {
    return new ShapeSchemaBuilder<any>({
      ...this.graph,
      ...(Object.entries(typeof typeDefinitions === 'function' ? typeDefinitions(this.graph) : typeDefinitions).map(([ID, typeDef]) => ({
        [ID]: new TypeNode(ID, typeDef.fields, typeDef.implements)
      })).reduce((a, b) => ({...a, ...b}), {}))
    }) as any;
  }

  /**
   * Define an Input Type - a named type that is allowed in Function and Query parameters.
   *
   * ```ts
   * schemaBuilder.input({
   *   AnimalInput: {
   *     name: gql.String['!']
   *   }
   * })
   * ```
   *
   * Input types can be used as function arguments:
   * ```ts
   * schemaBuilder.type(_ => ({
   *   Query: {
   *     addAnimal: gql.Function({input: _.AnimalInput}, _.Animal['!'])
   *   }
   * }))
   * ```
   *
   * @param inputDefinitions -
   */
  public input<I extends InputTypeDefinitions>(
    inputDefinitions: RowLacks<I, keyof G> | ((schema: G) => I)
  ): ShapeSchemaBuilder<G & {
    [ID in keyof I]: ID extends string ?
      InputTypeNode<
        ID,
        I[ID] extends (...args: any[]) => infer U ?
          Extract<U, RequestTypeNodes> :
          Extract<I[ID], RequestTypeNodes>
      > :
      never;
  }> {
    return new ShapeSchemaBuilder({
      ...this.graph,
      ...(Object.entries(typeof inputDefinitions === 'function' ? inputDefinitions(this.graph) : inputDefinitions).map(([ID, fields]) => ({
        [ID]: new InputTypeNode(ID, fields)
      })).reduce((a, b) => ({...a, ...b}), {}))
    }) as any;
  }

  /**
   * Define a Union type.
   *
   * ```ts
   * schemaBuilder.union({
   *   Animals: ['Dog', 'Cat']
   * })
   * ```
   *
   * @param union - map of union types
   */
  public union<U extends UnionDefinitions<G>>(union: U): ShapeSchemaBuilder<G & {
    [ID in keyof U]: ID extends string ? UnionTypeNode<ID, U[ID]> : never;
  }> {
    return new ShapeSchemaBuilder<any>({
      ...this.graph,
      ...(Object.entries(union).map(([ID, u]) => ({
        [ID]: new UnionTypeNode(ID, u)
      })).reduce((a, b) => ({...a, ...b}), {}))
    }) as any;
  }

  /**
   * Define enum types.
   *
   * Note: remember to cast the object `as const` or else the literal values of the enum
   * will not be caputured.
   *
   * ```ts
   * export const schemaBuilder = new gql.SchemaBuilder()
   *   .enum({
   *     Direction: {
   *       UP: 'UP',
   *       DOWN: 'DOWN',
   *       LEFT: 'LEFT',
   *       RIGHT: 'RIGHT',
   *     }
   *   } as const); // remember to specify as const
   * ```
   * @param definitions - enum definitions
   */
  public enum<D extends EnumDefinitions>(definitions: D): ShapeSchemaBuilder<G & {
    [ID in keyof D]: ID extends string ? EnumTypeNode<ID, D[ID]> : never;
  }> {
    return new ShapeSchemaBuilder({
      ...this.graph,
      ...(Object.entries(definitions).map(([ID, v]) => ({
        [ID]: new EnumTypeNode(ID, v)
      })).reduce((a, b) => ({...a, ...b}), {}))
      // [id]: new EnumType(id, values)
    }) as any;
  }
}

type Interfaces<T extends GraphQLAST> = (GraphQLAST.CollectNodes<{type: 'interface'}, T>['id'])[];

interface InterfaceDefinition<
  T extends GraphQLAST = GraphQLAST,
  E extends Interfaces<T> | undefined = Interfaces<T> | undefined
> {
  extends?: E;
  fields: ReturnTypeNodes
}
type InterfaceDefinitions<T extends GraphQLAST = GraphQLAST> = {
  [ID in string]: InterfaceDefinition<T>;
};

interface TypeDefinition<
  G extends GraphQLAST = GraphQLAST,
  E extends (GraphQLAST.CollectNodes<{type: 'interface'}, G>['id'])[] | undefined =
    (GraphQLAST.CollectNodes<{type: 'interface'}, G>['id'])[] | undefined
> {
  implements?: E;
  fields: ReturnTypeNodes;
}
type TypeDefinitions<T extends GraphQLAST = GraphQLAST> = {
  [ID in string]: TypeDefinition<T>;
};

type InputTypeDefinitions = {
  [ID in string]: RequestTypeNodes;
};

type EnumDefinitions = {
  [ID in string]: {
    [id in string]: string;
  }
};

type UnionDefinitions<T extends GraphQLAST = GraphQLAST> = {
  [ID in string]: GraphQLAST.CollectNodes<{type: 'type'}, T>['id'][]
};

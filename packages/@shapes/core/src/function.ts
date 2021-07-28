import { Shape } from './shape';

export interface FunctionArgs {
  [argName: string]: Shape;
}

export interface FunctionShapeProps<Args extends FunctionArgs, Returns extends Shape> {
  params: Args;
  returns: Returns;
}

export class FunctionShape<Args extends FunctionArgs = FunctionArgs, Returns extends Shape = Shape> extends Shape {
  public readonly Kind: 'functionShape' = 'functionShape';
  public readonly FQN: string;

  constructor(
    public readonly args: Args,
    public readonly returns: Returns
  ) {
    super();
    // compute the FQN
    this.FQN = `(${Object.entries(args).map(([k, v]) => `${k}: ${v.FQN}`).join(',')}) => ${returns.FQN}`;
  }
}

export function Fn<Args extends FunctionArgs, Returns extends Shape>(
  args: Args,
  returns: Returns
): FunctionShape<Args, Returns> {
  return new FunctionShape(args, returns);
}
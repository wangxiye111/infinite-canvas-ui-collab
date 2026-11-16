import { jimeng, kling } from "./cli.mjs";
import runninghub from "./runninghub.mjs";
import tripo from "./tripo.mjs";
import liblib from "./liblib.mjs";
import { createLocalCliProviders } from "./local-cli.mjs";

export function createProviders(ctx) {
  return [kling(ctx), jimeng(ctx), runninghub(ctx), tripo(ctx), liblib(ctx), ...createLocalCliProviders(ctx)];
}
export default createProviders;

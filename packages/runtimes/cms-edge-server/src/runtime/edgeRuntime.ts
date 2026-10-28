import { EdgeCms } from "@bernouy/cms-edge";
import { BunRunner } from "@bernouy/http-runner";
export type ProductionEdgeRuntime = { Runner: typeof BunRunner; Edge: typeof EdgeCms };
export const PRODUCTION_EDGE_RUNTIME: ProductionEdgeRuntime = { Runner: BunRunner, Edge: EdgeCms };

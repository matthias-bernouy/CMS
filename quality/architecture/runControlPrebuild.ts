import { pathToFileURL } from "node:url";

const prebuildPath = Bun.argv[2];
if (!prebuildPath) throw new Error("A Control prebuild module path is required");
const module = await import(pathToFileURL(prebuildPath).href) as { default?: () => Promise<void> };
if (typeof module.default !== "function") throw new Error(`${prebuildPath} has no default prebuild function`);
await module.default();

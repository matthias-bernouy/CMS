import { generateControlComponentAssetInProcess } from "./controlAsset";

const rootDir = Bun.argv[2];
if (!rootDir) throw new Error("A workspace root is required");
await Bun.write(Bun.stdout, await generateControlComponentAssetInProcess(rootDir));

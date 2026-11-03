import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { downloadFile, verifiedFile } from "./files";
import type { ModelFile, ModelRequest } from "./files";

export type ModelRelease = { model: string; revision: string; files: ModelFile[] };

export async function prepareModel(
    release: ModelRelease,
    destination: string,
    cache: string,
    request: ModelRequest = fetch,
): Promise<{ downloaded: number; reused: number }> {
    let downloaded = 0;
    for (const file of release.files) {
        const cached = join(cache, file.sha256);
        if (!(await verifiedFile(cached, file))) {
            await downloadFile(cached, file, request);
            downloaded++;
        }
    }
    // Publish only after every file has passed its integrity check.
    for (const file of release.files) {
        const target = join(destination, release.model, release.revision, file.path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(cache, file.sha256), target);
    }
    await Bun.write(join(destination, "release.json"), `${JSON.stringify(release, null, 4)}\n`);
    return { downloaded, reused: release.files.length - downloaded };
}

if (import.meta.main) {
    const destination = resolve(Bun.argv[2] ?? "artifacts/models");
    const cache = resolve(Bun.argv[3] ?? "artifacts/model-downloads");
    const release = (await Bun.file(new URL("./release.json", import.meta.url)).json()) as ModelRelease;
    console.log(await prepareModel(release, destination, cache));
}

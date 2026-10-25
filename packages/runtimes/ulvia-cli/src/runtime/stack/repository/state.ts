import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isOfficialImage, type OfficialImage } from "../orchestration/images";

export type StandaloneRepositoryState = Readonly<{
    schema: "ulvia.repository-service.v1";
    port: number;
    image: OfficialImage;
}>;

export async function readRepositoryState(root: string): Promise<StandaloneRepositoryState | null> {
    const source = await readFile(join(root, "service.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        return null;
    }
    const value = JSON.parse(source) as StandaloneRepositoryState;
    if (
        value.schema !== "ulvia.repository-service.v1" ||
        !isOfficialImage(value.image, "repository") ||
        !Number.isSafeInteger(value.port) ||
        value.port < 1 ||
        value.port > 65_535
    ) {
        throw new Error("Invalid standalone Repository state");
    }
    return value;
}

export async function saveRepositoryState(root: string, state: StandaloneRepositoryState): Promise<void> {
    const temporary = join(root, `${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, join(root, "service.json"));
}

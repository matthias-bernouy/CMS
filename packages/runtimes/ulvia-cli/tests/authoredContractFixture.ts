import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Convert canonical monolithic protocol fixtures into the authored source tree. */
export async function writeAuthoredContractFixture(
    directory: string,
    source: string | Uint8Array | Record<string, unknown>,
): Promise<void> {
    const document =
        typeof source === "string" || source instanceof Uint8Array
            ? (JSON.parse(
                  new TextDecoder().decode(typeof source === "string" ? new TextEncoder().encode(source) : source),
              ) as Record<string, unknown>)
            : structuredClone(source);
    const capabilities = document.capabilities;
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
        throw new TypeError("Contract fixture must contain capabilities");
    }
    delete document.capabilities;
    await mkdir(join(directory, "capabilities"), { recursive: true });
    await writeFile(join(directory, "definition.json"), JSON.stringify(document));
    for (const [index, value] of capabilities.entries()) {
        const capability = value as Record<string, unknown>;
        const { mocks, ...definition } = capability;
        await writeFile(join(directory, "capabilities", `${index}.json`), JSON.stringify(definition));
        if (!Array.isArray(mocks)) {
            continue;
        }
        await mkdir(join(directory, "mocks"), { recursive: true });
        for (const [mockIndex, mock] of mocks.entries()) {
            await writeFile(
                join(directory, "mocks", `${index}-${mockIndex}.json`),
                JSON.stringify({ capabilityId: capability.id, ...(mock as Record<string, unknown>) }),
            );
        }
    }
}

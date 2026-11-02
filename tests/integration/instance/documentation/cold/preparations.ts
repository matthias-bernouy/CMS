import { join } from "node:path";

type Preparation = {
    instanceId: string;
    revision: string;
    chunks: number;
    embedded: number;
    reused: number;
    durationMs: number;
};

export async function documentationPreparations(root: string, instanceId: string): Promise<Preparation[]> {
    const text = await Bun.file(join(root, "provider.log")).text();
    return text.split("\n").flatMap((line) => {
        try {
            const record = JSON.parse(line);
            return record.event === "provider.documentation.prepared" &&
                record.attributes.instanceId === instanceId &&
                record.attributes.chunks > 0
                ? [record.attributes as Preparation]
                : [];
        } catch {
            return [];
        }
    });
}

export async function waitForDocumentationPreparation(
    root: string,
    instanceId: string,
    afterCount = 0,
    revision?: string,
) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const events = await documentationPreparations(root, instanceId);
        const prepared = events
            .slice(afterCount)
            .find((event) => revision === undefined || event.revision === revision);
        if (prepared) {
            return prepared;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Documentation preparation did not finish within its test budget");
}

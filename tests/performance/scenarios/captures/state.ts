import { randomUUID } from "node:crypto";
import { authoringFixture } from "../authoring/fixture";
import { assertCondition, requireRecord } from "../queries/types";
import type { ScenarioClient } from "../../harness/clients/session";
import type { CapabilityInventory, Variant } from "../../capabilities/types";

export async function captureState(
    client: ScenarioClient,
    inventory: CapabilityInventory,
    capability: string,
    variant: Variant,
) {
    const checked = async (contract: string, id: string, input: Readonly<Record<string, unknown>>) => {
        const result = await client(contract, id, "http", input);
        assertCondition(result.observation.validated, `capture-fixture-${id}-failed`);
        return requireRecord(result.output);
    };
    const content = (id: string, input: Readonly<Record<string, unknown>>) => checked("ulvia/cms.content", id, input);
    const authoring = (id: string, input: Readonly<Record<string, unknown>>) =>
        checked("ulvia/cms.authoring", id, input);
    const pages: Readonly<Record<string, unknown>>[] = [];
    let preparedId: string | undefined;
    if (capability === "capture-prepared-example") {
        const implementation = inventory.targets.find(
            (entry) => !entry.retained && entry.release.contractId === "ulvia/cms.content",
        )!.release;
        const state = await authoringFixture(client, "discard-preparation", implementation);
        preparedId = String(state.prepared!.preparationId);
        return {
            input: {
                ...state.publication,
                exampleId: "panel",
                previewId: "desktop",
                locale: "en",
                themeMode: variant === "invalidation" ? "dark" : "light",
                dependencies: [],
            },
            content,
            async close() {
                await authoring("discard-preparation", { preparationId: preparedId });
            },
        };
    }
    const listed = await content("examples.list", { collectionId: "ulvia.test/smoke-kit", locale: "en", limit: 1 });
    const example = requireRecord((listed.items as unknown[])[0]);
    const preview = requireRecord((example.previews as unknown[])[0]);
    const exampleInput = {
        collectionId: "ulvia.test/smoke-kit",
        exampleId: example.id,
        previewId: preview.id,
        locale: "en",
        themeMode: variant === "invalidation" ? "dark" : "light",
    };
    if (capability === "examples.capture") {
        return { input: exampleInput, content, close: async () => {} };
    }
    const document = requireRecord(
        (await content("examples.get", { collectionId: exampleInput.collectionId, exampleId: example.id })).document,
    );
    const html = variant === "large" ? String(document.html).repeat(64) : String(document.html);
    const count = variant === "history" ? 32 : 1;
    for (let index = 0; index < count; index++) {
        pages.push(
            await content("pages.create", {
                path: `/capture-${randomUUID()}`,
                title: "Capture performance",
                content: html,
            }),
        );
    }
    let page = pages[0]!;
    if (variant === "invalidation") {
        page = await content("pages.update", {
            id: page.id,
            expectedRevision: page.revision,
            description: "Changed capture context",
        });
        pages[0] = page;
    }
    const pageInput = {
        id: page.id,
        expectedRevision: page.revision,
        locale: "en",
        options: {
            width: variant === "large" ? 1280 : 640,
            height: variant === "large" ? 1024 : 480,
            mode: "viewport",
            themeMode: "light",
        },
    };
    return {
        input: pageInput,
        content,
        async close() {
            for (const page of pages.reverse()) {
                await content("pages.delete", { id: page.id, expectedRevision: page.revision });
            }
        },
    };
}

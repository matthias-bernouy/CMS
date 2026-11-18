import { randomUUID } from "node:crypto";
import { assertCondition } from "../queries/types";
import { fixturePage } from "./client";
import { verifyPageRefusals } from "./scale/verify";
import { preparePageState } from "./scale/preparation";
import type { PagePreparation } from "./scale/preparation";
import type { PageClient } from "./client";
import type { PreparedSample } from "../../harness/execution/samples";

export const PAGE_CAPABILITIES = [
    "pages.create",
    "pages.get",
    "pages.update",
    "pages.rename",
    "pages.update-route",
    "pages.update-seo",
    "pages.publish",
    "pages.delete",
] as const;

export async function preparePage(
    client: PageClient,
    capability: string,
    binding: string,
    options: PagePreparation = {},
): Promise<PreparedSample> {
    const suffix = randomUUID();
    const title = `Performance ${suffix}`;
    const path = `/performance-${suffix}`;
    const { page, content, creation, marker } = await preparePageState(
        client,
        capability,
        binding,
        path,
        title,
        options,
    );
    const localization = ["pages.update-route", "pages.update-seo"].includes(capability)
        ? await fixturePage(client, "localization.get", {})
        : null;
    let result: Readonly<Record<string, unknown>> | undefined;
    const input =
        capability === "pages.create"
            ? creation
            : capability === "pages.get"
              ? { id: page!.id }
              : {
                    id: page!.id,
                    expectedRevision: page!.revision,
                    ...(capability === "pages.update" ? { description: "Updated performance description" } : {}),
                    ...(capability === "pages.rename" ? { title: "Renamed performance fixture" } : {}),
                    ...(capability === "pages.publish" ? { visible: true } : {}),
                    ...(capability === "pages.update-route"
                        ? { language: localization!.language, path: `${path}-route` }
                        : {}),
                    ...(capability === "pages.update-seo"
                        ? {
                              language: localization!.language,
                              title: "Performance SEO",
                              description: "Performance SEO description",
                          }
                        : {}),
                };
    return {
        async send() {
            const call = await client(capability, binding, input, (output) => {
                result = output;
                if (
                    (options.history || options.contentBytes || options.invalidate) &&
                    page &&
                    capability !== "pages.get" &&
                    capability !== "pages.delete"
                ) {
                    assertCondition(output.revision === Number(page.revision) + 1, "page-scale-mutation-revision");
                }
                assertCondition(typeof output.id === "string" && (!page || output.id === page.id));
                if (capability === "pages.create") {
                    assertCondition(output.path === path && output.title === title);
                }
                if (capability === "pages.get") {
                    assertCondition(output.path === path && output.title === title);
                    if (options.history) {
                        assertCondition(
                            output.revision === page!.revision &&
                                output.description === `Previous controlled revision ${(options.history ?? 0) - 1}`,
                            "page-scale-history-stale",
                        );
                    }
                    if (content) {
                        assertCondition(output.content === content);
                    }
                    if (options.invalidate) {
                        assertCondition(output.description === marker && output.revision === page!.revision);
                    }
                }
                if (capability === "pages.update") {
                    assertCondition(output.description === "Updated performance description");
                }
                if (capability === "pages.rename") {
                    assertCondition(output.title === "Renamed performance fixture");
                }
                if (capability === "pages.publish") {
                    assertCondition(output.visible === true);
                }
                if (capability === "pages.delete") {
                    assertCondition(output.deleted === true);
                }
                if (capability === "pages.update-route") {
                    assertCondition(
                        Array.isArray(output.routes) && output.routes.some((route) => route.path === `${path}-route`),
                    );
                }
                if (capability === "pages.update-seo") {
                    assertCondition(
                        Array.isArray(output.seoEntries) &&
                            output.seoEntries.some((seo) => seo.title === "Performance SEO"),
                    );
                }
            });
            return call.observation;
        },
        async verify() {
            let persisted: Readonly<Record<string, unknown>> | undefined;
            if (!result) {
                throw new Error("No valid Page mutation result");
            }
            if (capability === "pages.delete") {
                const listing = await fixturePage(client, "pages.list", { query: title, limit: 100 });
                assertCondition(Array.isArray(listing.items) && !listing.items.some((item) => item.id === page!.id));
            } else {
                const stored = await fixturePage(client, "pages.get", { id: result.id });
                persisted = stored;
                assertCondition(stored.id === result.id && stored.revision === result.revision);
                for (const field of ["title", "path", "description", "visible", "routes", "seoEntries"]) {
                    if (Object.hasOwn(result, field)) {
                        assertCondition(JSON.stringify(stored[field]) === JSON.stringify(result[field]));
                    }
                }
            }
            await verifyPageRefusals(client, capability, input, result, persisted, options);
        },
        async close() {
            const id = result?.id ?? page?.id;
            if (id && !(capability === "pages.delete" && result?.deleted === true)) {
                const current = await fixturePage(client, "pages.get", { id });
                await fixturePage(client, "pages.delete", { id, expectedRevision: current.revision });
            }
        },
    };
}

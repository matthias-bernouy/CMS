import { randomUUID } from "node:crypto";
import { assertCondition } from "../queries/types";
import { fixturePage } from "./client";
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

export async function preparePage(client: PageClient, capability: string, binding: string): Promise<PreparedSample> {
    const suffix = randomUUID();
    const title = `Performance ${suffix}`;
    const path = `/performance-${suffix}`;
    const page = capability === "pages.create" ? null : await fixturePage(client, "pages.create", { path, title });
    const localization = ["pages.update-route", "pages.update-seo"].includes(capability)
        ? await fixturePage(client, "localization.get", {})
        : null;
    let result: Readonly<Record<string, unknown>> | undefined;
    const input =
        capability === "pages.create"
            ? { path, title }
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
                assertCondition(typeof output.id === "string" && (!page || output.id === page.id));
                if (capability === "pages.create") {
                    assertCondition(output.path === path && output.title === title);
                }
                if (capability === "pages.get") {
                    assertCondition(output.path === path && output.title === title);
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
            if (!result) {
                throw new Error("No valid Page mutation result");
            }
            if (capability === "pages.delete") {
                const listing = await fixturePage(client, "pages.list", { query: title, limit: 100 });
                assertCondition(Array.isArray(listing.items) && !listing.items.some((item) => item.id === page!.id));
            } else {
                const stored = await fixturePage(client, "pages.get", { id: result.id });
                assertCondition(stored.id === result.id && stored.revision === result.revision);
                for (const field of ["title", "path", "description", "visible", "routes", "seoEntries"]) {
                    if (Object.hasOwn(result, field)) {
                        assertCondition(JSON.stringify(stored[field]) === JSON.stringify(result[field]));
                    }
                }
            }
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

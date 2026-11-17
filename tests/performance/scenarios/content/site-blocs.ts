import { randomUUID } from "node:crypto";
import { ClientFailure } from "../../harness/clients/failure";
import { assertCondition, requireRecord } from "../queries/types";
import type { ScenarioClient } from "../../harness/clients/session";
import type { PreparedSample } from "../../harness/execution/samples";

export const SITE_BLOC_CAPABILITIES = [
    "site-blocs.create",
    "site-blocs.get",
    "site-blocs.publish",
    "site-blocs.archive",
    "site-blocs.restore",
] as const;

export async function prepareSiteBloc(
    client: ScenarioClient,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const tag = `site-performance-${randomUUID()}`;
    const name = `Performance ${tag}`;
    const input = { tag, name, group: "Performance", content: "<section><p>Controlled composition</p></section>" };
    const fixture = async (id: string, value: Readonly<Record<string, unknown>>) => {
        const result = await client("ulvia/cms.content", id, "http", value);
        if (!result.observation.validated) {
            throw new ClientFailure(`fixture-${id}-${result.observation.failure ?? "invalid-result"}`);
        }
        return requireRecord(result.output);
    };
    let created = capability === "site-blocs.create" ? null : await fixture("site-blocs.create", input);
    if (capability === "site-blocs.restore") {
        created = await fixture("site-blocs.archive", { tag, revision: created!.draftRevision });
    }
    let output: Readonly<Record<string, unknown>> | undefined;
    return {
        async send() {
            const result = await client(
                "ulvia/cms.content",
                capability,
                binding,
                capability === "site-blocs.create"
                    ? input
                    : capability === "site-blocs.get"
                      ? { tag }
                      : { tag, revision: created!.draftRevision },
                (value) => {
                    output = requireRecord(value);
                    assertCondition(output.tag === tag && output.name === name && output.group === "Performance");
                    assertCondition(output.lifecycle === (capability === "site-blocs.archive" ? "archived" : "active"));
                    if (capability === "site-blocs.publish") {
                        assertCondition(output.publishedRevision === created!.draftRevision);
                    }
                },
            );
            return result.observation;
        },
        async verify() {
            const stored = await fixture("site-blocs.get", { tag });
            assertCondition(JSON.stringify(stored) === JSON.stringify(output));
            const catalogue = await fixture("site-blocs.list", {});
            assertCondition(Array.isArray(catalogue.items) && catalogue.items.some((item) => item.tag === tag));
        },
        async close() {
            if (output || created) {
                const current = await fixture("site-blocs.get", { tag });
                if (current.lifecycle !== "archived") {
                    await fixture("site-blocs.archive", { tag, revision: current.draftRevision });
                }
            }
            // Archived fixtures remain bounded to this disposable instance and disappear with stack teardown.
        },
    };
}

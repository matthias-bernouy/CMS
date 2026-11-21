import type { Variant } from "../../../capabilities/types";
import type { settingsTenants } from "../../content/settings/tenant";
import { assertCondition, requireRecord } from "../../queries/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import { prepareAccountAssociation } from "./accounts";

const state = new WeakMap<object, Map<string, string>>();
const templateContract = "ulvia/cms.email-templates";
export async function prepareTemplate(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    contract: string,
    capability: string,
    variant: Variant,
    binding: string,
): Promise<PreparedSample> {
    try {
        await lease.value.prepare("mcp");
        const client = lease.value.client;
        const call = async (id: string, input: Readonly<Record<string, unknown>>) => {
            const result = await client(templateContract, id, "http", input);
            assertCondition(result.observation.validated, "template-fixture-call-failed");
            return requireRecord(result.output);
        };
        if (contract === "ulvia/cms.access") {
            return await prepareAccountAssociation(lease, capability, variant, binding);
        }
        let models = state.get(lease.value);
        if (!models) {
            models = new Map();
            state.set(lease.value, models);
        }
        const key = capability === "templates.list" ? capability : `${capability}:${variant}`;
        let id = models.get(key);
        const draft = {
            subject: "Performance {{title}}",
            text: "Recorded {{title}}",
            variables: [{ name: "title", kind: "text", required: true }],
        };
        if (capability !== "templates.create" && !id) {
            id = crypto.randomUUID();
            await call("templates.create", { id, name: "Performance", description: "", locale: "en", draft });
            models.set(key, id);
            if (capability !== "templates.publish") {
                await call("templates.publish", { id, expectedRevision: 1 });
            }
        }
        if (capability === "templates.list" && ["large", "history"].includes(variant) && !models.has("large-dataset")) {
            for (let index = 0; index < 64; index++) {
                await call("templates.create", {
                    id: crypto.randomUUID(),
                    name: `History ${index}`,
                    description: "",
                    locale: "en",
                    draft,
                });
            }
            models.set("large-dataset", "ready");
        }
        const current = id ? await call("templates.get", { id }) : undefined;
        const values = [{ name: "title", value: "measured" }];
        let input: Readonly<Record<string, unknown>> =
            capability === "templates.create"
                ? { id: crypto.randomUUID(), name: "Measured", description: "", locale: "en", draft }
                : capability === "templates.list"
                  ? { limit: 100, includeArchived: true }
                  : capability === "templates.get-version"
                    ? { id, version: 1 }
                    : capability === "templates.render"
                      ? { id, version: 1, values }
                      : capability === "templates.preview"
                        ? { id, expectedRevision: current!.revision, values }
                        : capability === "templates.get"
                          ? { id }
                          : { id, expectedRevision: current!.revision };
        if (capability === "templates.update-draft") {
            input = {
                ...input,
                name: `Updated ${crypto.randomUUID()}`,
                description: "",
                draft: { ...draft, text: `Updated ${crypto.randomUUID()}` },
            };
        }
        if (variant === "invalidation" && capability !== "templates.list") {
            await call("templates.update-draft", {
                id,
                expectedRevision: current!.revision,
                name: "Changed before read",
                description: "",
                draft,
            });
            if (capability === "templates.preview") {
                input = { ...input, expectedRevision: Number(current!.revision) + 1 };
            }
        }
        const expected = (output: unknown) => {
            const result = requireRecord(output);
            if (["templates.render", "templates.preview"].includes(capability)) {
                assertCondition(result.subject === "Performance measured" && result.text === "Recorded measured");
            } else if (capability === "templates.list") {
                assertCondition(
                    Array.isArray(result.items) &&
                        result.items.length >= (["large", "history"].includes(variant) ? 65 : 3),
                );
                assertCondition(result.items.every((row) => !Object.hasOwn(requireRecord(row), "draft")));
            } else if (capability === "templates.publish") {
                assertCondition(result.version === Number(current!.latestVersion) + 1);
            } else if (capability === "templates.archive") {
                assertCondition(result.archived === true);
            } else if (capability === "templates.create") {
                assertCondition(result.id === input.id && result.latestVersion === 0);
            } else {
                assertCondition(result.id === id);
            }
        };
        return {
            send: async () => (await client(templateContract, capability, binding, input, expected)).observation,
            close: async () => lease.release(),
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}

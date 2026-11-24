import { assertCondition, requireRecord } from "../queries/types";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { formsTenant } from "./tenant";
import type { Variant } from "../../capabilities/types";
import type { PreparedSample } from "../../harness/execution/samples";
import type { FormDraft } from "@bernouy/forms";

export async function prepareFormSchema(
    tenant: Awaited<ReturnType<typeof formsTenant>>,
    capability: string,
    binding: string,
    variant: Variant,
    formId: string,
    draft: FormDraft,
): Promise<PreparedSample> {
    const list = capability === "forms.list-submission-sources";
    const ids = [formId];
    if (list && ["large", "history"].includes(variant)) {
        for (let index = 0; index < (variant === "large" ? 100 : 40); index++) {
            const id = crypto.randomUUID();
            await tenant.call("forms.create", { formId: id, draft });
            for (let revision = 1; revision <= (variant === "history" ? 3 : 1); revision++) {
                await tenant.call("forms.publish", { formId: id, expectedRevision: revision });
            }
            ids.push(id);
        }
    }
    const input = list ? { limit: 25 } : { selectorJson: JSON.stringify({ formId }) };
    if (!list && ["large", "invalidation"].includes(variant)) {
        if (variant === "invalidation") {
            await tenant.call(capability, input);
        }
        const fields =
            variant === "large"
                ? Array.from({ length: 300 }, (_, index) => ({
                      id: `field${index}`,
                      kind: "number",
                      label: `Field ${index}`,
                  }))
                : [...draft.fields, { id: "added", kind: "text", label: "Added" }];
        await tenant.call("forms.update-draft", { formId, expectedRevision: 3, draft: { ...draft, fields } });
        await tenant.call("forms.publish", { formId, expectedRevision: 4 });
    }
    let output: Readonly<Record<string, unknown>>;
    return {
        send: async () =>
            (
                await tenant.client("ulvia/cms.forms", capability, binding, input, (value) => {
                    output = requireRecord(value);
                    if (list) {
                        assertCondition(Array.isArray(output.items));
                        const actual = output.items.map(
                            (row) => JSON.parse(String(requireRecord(row).selectorJson)).formId,
                        );
                        assertCondition(canonicalizeIJson(actual) === canonicalizeIJson([...ids].sort().slice(0, 25)));
                        assertCondition(
                            ids.length > 25 ? typeof output.nextCursor === "string" : output.nextCursor === undefined,
                        );
                    } else {
                        assertCondition(
                            output.resourceId === formId &&
                                typeof output.schemaJson === "string" &&
                                Array.isArray(output.fields),
                        );
                        assertCondition(
                            output.fields.length === (variant === "large" ? 300 : variant === "invalidation" ? 2 : 1),
                        );
                        assertCondition(output.version === (["large", "invalidation"].includes(variant) ? "4" : "1"));
                    }
                })
            ).observation,
        verify: async () => {
            const current = await tenant.call("forms.get", { formId });
            assertCondition(current.id === formId);
            if (!list) {
                const exact = await tenant.call(capability, {
                    selectorJson: JSON.stringify({ formId }),
                    version: output.version,
                });
                assertCondition(exact.digest === output.digest && exact.schemaJson === output.schemaJson);
            }
        },
        close: tenant.close,
    };
}

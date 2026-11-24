import type { FormDraft } from "@bernouy/forms";
import { prepareFormSchema } from "./schema";
import { draft as baseDraft } from "../../../../packages/features/forms/tests/fixtures";
import { formsTenant } from "./tenant";
import { equal, listPage } from "./oracles";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory, Variant } from "../../capabilities/types";
import type { FreshTenant } from "../installations/fresh";
import type { QueryEnvironment } from "../queries/execute";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareForms(
    inventory: CapabilityInventory,
    fresh: FreshTenant,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    try {
        const tenant = await formsTenant(inventory, fresh, binding, capability !== "select-contract");
        if (capability === "select-contract") {
            let selected: unknown;
            return {
                send: async () =>
                    (
                        await tenant.client(
                            "ulvia/cms.installations",
                            capability,
                            binding,
                            tenant.candidate,
                            (output) => {
                                selected = requireRecord(output).selected;
                                assertCondition(
                                    Array.isArray(selected) &&
                                        selected.some((pin) => requireRecord(pin).contractId === "ulvia/cms.forms"),
                                );
                            },
                        )
                    ).observation,
                verify: async () => {
                    const current = await tenant.call("list-provider-installations", {}, "ulvia/cms.installations");
                    assertCondition(Array.isArray(current.selections));
                    equal(
                        current.selections.map((pin) => {
                            const { siteId: _site, ...rest } = requireRecord(pin);
                            return rest;
                        }),
                        (selected as unknown[]).map((pin) => {
                            const { siteId: _site, ...rest } = requireRecord(pin);
                            return rest;
                        }),
                    );
                },
                close: tenant.close,
            };
        }
        const draft: FormDraft = {
            ...baseDraft,
            fields: [{ id: "message", kind: "text", label: "Message" }],
            accessMode: capability === "forms.submit-authenticated" ? "authenticated" : "public",
            notification: { ...baseDraft.notification, enabled: capability === "submissions.retry-notification" },
        };
        const formId = crypto.randomUUID();
        await tenant.call("forms.create", { formId, draft });
        await tenant.call("forms.publish", { formId, expectedRevision: 1 });
        let form = await tenant.call("forms.set-availability", { formId, expectedRevision: 2, availability: "open" });
        if (["forms.describe-submission", "forms.list-submission-sources"].includes(capability)) {
            return prepareFormSchema(tenant, capability, binding, variant, formId, draft);
        }
        const answers = [{ fieldId: "message", kind: "text", text: "Retained performance answer" }];
        const submit = () =>
            tenant.call(capability === "forms.submit-authenticated" ? capability : "forms.submit", {
                formId,
                formVersion: 1,
                attemptId: crypto.randomUUID(),
                answers,
            });
        const ids: string[] = [];
        let receipt: Readonly<Record<string, unknown>> | undefined;
        if (capability === "forms.list") {
            ids.push(formId);
            const count = variant === "large" ? 101 : variant === "history" ? 41 : 1;
            for (let index = 0; index < count; index++) {
                const id = crypto.randomUUID();
                await tenant.call("forms.create", { formId: id, draft });
                ids.push(id);
                if (variant === "history") {
                    for (const revision of [1, 2, 3]) {
                        await tenant.call("forms.publish", { formId: id, expectedRevision: revision });
                    }
                }
            }
        } else if (capability.startsWith("submissions.")) {
            const count =
                capability === "submissions.list" ? (variant === "large" ? 101 : variant === "history" ? 41 : 1) : 1;
            for (let index = 0; index < count; index++) {
                const ack = await submit();
                receipt = await tenant.call("submissions.get", { receiptId: ack.receiptId });
                if (variant === "history" && index % 2 === 0) {
                    await tenant.call("submissions.delete", { receiptId: ack.receiptId });
                } else {
                    ids.push(String(ack.receiptId));
                }
            }
        }
        if (capability === "submissions.retry-notification") {
            for (let attempt = 0; attempt < 150; attempt++) {
                receipt = await tenant.call("submissions.get", { receiptId: receipt!.receiptId });
                const notifications = receipt.notifications;
                assertCondition(Array.isArray(notifications));
                if (["blocked", "failed"].includes(String(requireRecord(notifications[0]).state))) {
                    break;
                }
                await Bun.sleep(100);
            }
        }
        if (variant === "invalidation") {
            if (capability === "forms.list") {
                const id = crypto.randomUUID();
                await tenant.call("forms.list", { limit: 25 });
                await tenant.call("forms.create", { formId: id, draft });
                ids.push(id);
            } else if (capability === "submissions.list") {
                await tenant.call(capability, { formId, limit: 25 });
                const ack = await submit();
                ids.push(String(ack.receiptId));
            } else if (capability === "submissions.get") {
                await tenant.call(capability, { receiptId: receipt!.receiptId });
                await tenant.call("submissions.set-status", {
                    receiptId: receipt!.receiptId,
                    expectedRevision: receipt!.revision,
                    status: "read",
                });
                receipt = await tenant.call(capability, { receiptId: receipt!.receiptId });
            } else {
                await tenant.call(capability, { formId });
                form = await tenant.call("forms.update-draft", {
                    formId,
                    expectedRevision: 3,
                    draft: { ...draft, title: "Changed" },
                });
                if (capability === "forms.get-public-definition") {
                    await tenant.call("forms.publish", { formId, expectedRevision: 4 });
                    form = await tenant.call("forms.get", { formId });
                }
            }
        }
        const inputs: Record<string, Readonly<Record<string, unknown>>> = {
            "forms.create": { formId: crypto.randomUUID(), draft },
            "forms.get": { formId },
            "forms.list": { limit: 25 },
            "forms.update-draft": { formId, expectedRevision: 3, draft: { ...draft, title: "Updated" } },
            "forms.publish": { formId, expectedRevision: 3 },
            "forms.set-availability": { formId, expectedRevision: 3, availability: "closed" },
            "forms.archive": { formId, expectedRevision: 3 },
            "forms.get-public-definition": { formId },
            "forms.submit": { formId, formVersion: 1, attemptId: crypto.randomUUID(), answers },
            "forms.submit-authenticated": { formId, formVersion: 1, attemptId: crypto.randomUUID(), answers },
            "submissions.get": { receiptId: receipt?.receiptId },
            "submissions.list": { formId, limit: 25 },
            "submissions.set-status": {
                receiptId: receipt?.receiptId,
                expectedRevision: receipt?.revision,
                status: "processed",
            },
            "submissions.retry-notification": {
                receiptId: receipt?.receiptId,
                expectedRevision: receipt?.revision,
                index: 0,
                intentGeneration: 1,
                acceptDuplicateRisk: false,
            },
            "submissions.delete": { receiptId: receipt?.receiptId },
        };
        let result: Readonly<Record<string, unknown>> | undefined;
        return {
            send: async () =>
                (
                    await tenant.client("ulvia/cms.forms", capability, binding, inputs[capability]!, (value) => {
                        result = requireRecord(value);
                        if (capability.endsWith(".list")) {
                            listPage(result, ids, capability === "submissions.list");
                        }
                        if (capability === "forms.get") {
                            equal(result, form);
                        }
                        if (capability === "submissions.get") {
                            equal(result, receipt);
                        }
                        if (capability === "forms.get-public-definition") {
                            assertCondition(
                                result.formVersion === form.currentVersion &&
                                    result.accepting === true &&
                                    result.title === requireRecord(form.draft).title &&
                                    !("notification" in result),
                            );
                        }
                    })
                ).observation,
            verify: async () => {
                assertCondition(result);
                if (capability === "forms.create") {
                    equal(requireRecord(await tenant.call("forms.get", { formId: result.formId })).draft, draft);
                }
                if (capability.startsWith("forms.submit")) {
                    assertCondition(result.received === true);
                    equal(
                        requireRecord(await tenant.call("submissions.get", { receiptId: result.receiptId })).answers,
                        answers,
                    );
                }
                if (["forms.update-draft", "forms.set-availability", "forms.archive"].includes(capability)) {
                    equal(await tenant.call("forms.get", { formId }), result);
                    assertCondition(result.revision === 4);
                }
                if (capability === "forms.publish") {
                    assertCondition(result.version === 3);
                    equal(
                        requireRecord(
                            (await tenant.call("forms.get", { formId, version: result.version })).publishedVersion,
                        ).draft,
                        draft,
                    );
                }
                if (capability === "submissions.set-status") {
                    assertCondition(
                        (await tenant.call("submissions.get", { receiptId: receipt!.receiptId })).status ===
                            "processed",
                    );
                }
                if (capability === "submissions.retry-notification") {
                    const notifications = (await tenant.call("submissions.get", { receiptId: receipt!.receiptId }))
                        .notifications;
                    assertCondition(Array.isArray(notifications) && requireRecord(notifications[0]).generation === 2);
                }
                if (capability === "submissions.delete") {
                    assertCondition(result.deleted === true);
                    const read = await tenant.client("ulvia/cms.forms", "submissions.get", "http", {
                        receiptId: receipt!.receiptId,
                    });
                    assertCondition(!read.observation.validated && read.observation.status === 410);
                }
                const foreign = await tenant.client("ulvia/cms.forms", "forms.get", "http", { formId }, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
            },
            close: tenant.close,
        };
    } catch (error) {
        await fresh.close();
        throw error;
    }
}

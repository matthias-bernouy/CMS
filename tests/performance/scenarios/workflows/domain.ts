import { initiatorWorkflow } from "../../../integration/instance/forms/initiator";
import { answers, draft } from "../../../../packages/features/forms/tests/fixtures";
import { assertCondition, requireRecord } from "../queries/types";
import { domainSource } from "./source";
import type { WorkflowContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";
import type { Variant } from "../../capabilities/types";
export const EVENTS = "ulvia/cms.events";
export async function prepareDomain(
    context: WorkflowContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    const selected = await domainSource(context, variant);
    const { source, selectorJson, payloadJson } = selected;
    const subscriptionId = crypto.randomUUID();
    const own = { consumerContractId: "ulvia/cms.workflows", subscriptionId };
    const configuration = {
        definitionId: source.definitionId,
        definitionDigest: source.digest,
        enabled: capability === "deliveries.list",
        filterJson: selectorJson,
        delivery: { contractId: "ulvia/cms.workflows", capabilityId: "events.receive" },
    };
    const invoke = async (id: string, input: Readonly<Record<string, unknown>>) =>
        (await (await context.machine(id, EVENTS))(input)).output;
    const diagnostics = capability === "deliveries.list";
    const subscriptions = capability.startsWith("subscriptions.");
    if ((subscriptions && capability !== "subscriptions.create") || diagnostics) {
        const count =
            capability === "subscriptions.list" || diagnostics
                ? variant === "large"
                    ? 101
                    : variant === "history"
                      ? 41
                      : 1
                : 1;
        for (let index = 0; index < count; index++) {
            await invoke("subscriptions.create", {
                ...own,
                subscriptionId: index === 0 ? subscriptionId : crypto.randomUUID(),
                configuration,
            });
        }
    }
    const inputs: Record<string, Readonly<Record<string, unknown>>> = {
        "sources.resolve": { contractId: "ulvia/cms.forms", eventType: "submission.created" },
        "sources.get": { definitionId: source.definitionId },
        "sources.list": { contractId: "ulvia/cms.forms", limit: 100 },
        "events.publish": {
            contractId: "ulvia/cms.forms",
            eventType: "submission.created",
            occurrenceId: crypto.randomUUID(),
            payloadJson,
        },
        "subscriptions.create": { ...own, configuration },
        "subscriptions.get": own,
        "subscriptions.list": { consumerContractId: own.consumerContractId, limit: 100 },
        "deliveries.list": { consumerContractId: own.consumerContractId, limit: 100 },
        "subscriptions.update": { ...own, expectedRevision: 1, configuration },
        "subscriptions.delete": { ...own, expectedRevision: 1 },
    };
    if (diagnostics) {
        await invoke("events.publish", inputs["events.publish"]!);
        const expected = variant === "large" ? 100 : variant === "history" ? 41 : 1;
        for (let attempt = 0; attempt < 200; attempt++) {
            const status = requireRecord(await invoke("deliveries.list", inputs["deliveries.list"]!));
            if (Array.isArray(status.items) && status.items.length >= expected) {
                break;
            }
            if (attempt === 199) {
                throw new Error("Delivery diagnostics fixture did not finish its fanout");
            }
            await Bun.sleep(50);
        }
    }
    inputs["initiators.capture"] = {
        contractId: "ulvia/cms.forms",
        eventType: "submission.created",
        occurrenceId: crypto.randomUUID(),
    };
    if (capability === "initiators.resolve") {
        const formId = crypto.randomUUID();
        await selected.forms.call("forms.create", {
            formId,
            draft: { ...draft, accessMode: "authenticated" },
        });
        await selected.forms.call("forms.publish", { formId, expectedRevision: 1 });
        const observe = await initiatorWorkflow(async (path, input, _method, contractId) => {
            const target = context.inventory.targets.find(
                (entry) =>
                    !entry.retained &&
                    entry.release.contractId === contractId &&
                    entry.definition.bindings.some((binding) => binding.transport === "http" && binding.path === path),
            );
            assertCondition(target);
            return context.fresh.fixture(target.definition.id, input as Readonly<Record<string, unknown>>, contractId);
        }, formId);
        await selected.forms.call("forms.set-availability", {
            formId,
            expectedRevision: 2,
            availability: "open",
        });
        const attemptId = crypto.randomUUID();
        await selected.forms.call("forms.submit-authenticated", { formId, formVersion: 1, attemptId, answers });
        const event = await observe(attemptId);
        assertCondition(event.initiator.kind === "user");
        inputs[capability] = { reference: event.initiator.reference, targetContractId: "ulvia/cms.forms" };
    }
    const input = inputs[capability];
    assertCondition(input, "domain-event-capability-case-missing");
    const machine =
        subscriptions || diagnostics || capability === "events.publish" || capability === "initiators.capture"
            ? await context.machine(capability, EVENTS)
            : undefined;
    let output: Readonly<Record<string, unknown>>;
    return {
        send: async () =>
            (
                await (machine
                    ? machine(input, (value) => {
                          output = requireRecord(value);
                      })
                    : context.fresh.client(EVENTS, capability, binding, input, (value) => {
                          output = requireRecord(value);
                      }))
            ).observation,
        verify: async () => {
            if (capability === "events.publish") {
                const replay = requireRecord(await invoke(capability, input));
                assertCondition(
                    output.accepted === true && replay.occurrenceId === output.occurrenceId,
                    "event-stable-receipt",
                );
            } else if (capability === "initiators.capture") {
                assertCondition(typeof output.proof === "string" && output.proof.startsWith("ei1."));
            } else if (capability === "initiators.resolve") {
                assertCondition(
                    typeof output.authority === "string" &&
                        typeof output.subjectId === "string" &&
                        output.subjectId !== context.fresh.session.subjectId,
                );
            } else if (capability === "subscriptions.delete") {
                assertCondition(output.deleted === true);
            } else if (capability === "subscriptions.update") {
                assertCondition(output.revision === 2);
            } else if (capability === "subscriptions.list" || diagnostics) {
                assertCondition(
                    Array.isArray(output.items) &&
                        output.items.length === (variant === "large" ? 100 : variant === "history" ? 41 : 1),
                );
            } else if (capability === "sources.list") {
                assertCondition(
                    Array.isArray(output.items) && output.items.length === 1,
                    "resource-history-does-not-duplicate-event-types",
                );
            } else if (capability.startsWith("sources.")) {
                assertCondition(output.definitionId === source.definitionId && output.digest === source.digest);
            } else {
                assertCondition(output.subscriptionId === subscriptionId);
            }
        },
        close: context.fresh.close,
    };
}

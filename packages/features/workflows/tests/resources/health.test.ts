import { SchemaResolutionError, applySchemaBindings } from "@bernouy/ulvia-contracts/resolution";
import type { UlviaResolvedSchema } from "@bernouy/ulvia-contracts/schema";
import { expect, test } from "bun:test";
import { WorkflowTriggers, WorkflowError, receiveWorkflowMessage } from "@bernouy/workflows";
import type { SchemaDescriptor } from "@bernouy/ulvia-contracts";
import { domainFixture, document, message, context } from "../support/domain";
async function active() {
    const f = domainFixture();
    Object.assign(f.source, {
        schema: {
            type: "object",
            properties: {
                formId: { type: "string", maxLength: 64 },
                formVersion: { type: "integer", minimum: 1 },
                answers: {
                    type: "resolved",
                    resolver: "forms.describe",
                    selector: { formId: { source: "value", path: "/formId" } },
                    version: { source: "value", path: "/formVersion" },
                },
            },
            required: ["formId", "formVersion", "answers"],
        },
        filterKeys: ["formId"],
    });
    const resource: SchemaDescriptor = {
        resourceId: "contact",
        version: "1",
        digest: `sha256:${"c".repeat(64)}`,
        schema: {
            type: "object",
            properties: { id: { type: "string", minLength: 1, maxLength: 32 }, unused: { type: "boolean" } },
            required: ["id", "unused"],
        },
        fields: ["id", "unused"].map((property) => ({ id: property, property, label: property, sensitive: false })),
    };
    f.services.contracts.resolveEventSchema = async (definition) => {
        const bindings = [
            {
                path: "/answers",
                declaration: (definition.schema.type === "object"
                    ? definition.schema.properties.answers
                    : undefined) as UlviaResolvedSchema,
                selectorJson: '{"formId":"contact"}',
                descriptor: structuredClone(resource),
            },
        ];
        return { schema: applySchemaBindings(definition.schema, bindings), bindings };
    };
    const flow = {
        ...document,
        trigger: { ...document.trigger, filter: { kind: "literal", value: { formId: "contact" } } },
        steps: document.steps.map((step) =>
            step.id === "read"
                ? { ...step, input: { kind: "object", fields: { id: { kind: "trigger", path: "/data/answers/id" } } } }
                : step,
        ),
    };
    await f.definitions.create("workflow", JSON.stringify(flow), "{}");
    await f.definitions.publish("workflow", 1);
    await f.triggers.create("trigger", "workflow", 1, "admin");
    const event = {
        ...message(),
        schemas: [
            {
                path: "/answers",
                resolver: "forms.describe",
                resourceId: "contact",
                version: "2",
                digest: resource.digest,
            },
        ],
        payloadJson: '{"formId":"contact","formVersion":2,"answers":{"id":"order"}}',
    };
    return { ...f, resource, event };
}
test("a remote source can remove unused fields while the trigger continues with projected historical schemas", async () => {
    const f = await active();
    Object.assign(f.resource, {
        schema: {
            type: "object",
            properties: { id: { type: "string", minLength: 1, maxLength: 32 } },
            required: ["id"],
        },
        fields: [f.resource.fields[0]!],
    });
    await receiveWorkflowMessage(f.services, f.event, context);
    expect((await f.store.trigger("trigger"))!.diagnostic).toBeUndefined();
    expect((await f.store.trigger("trigger"))!.state).toBe("active");
    expect(f.store.runRecords.size).toBe(1);
});
test("used-field deletion is permitted at the source and suspends only the consumer without emitting a business call", async () => {
    const f = await active();
    Object.assign(f.resource, { schema: { type: "object", properties: {}, required: [] }, fields: [] });
    const original = (await f.store.trigger("trigger"))!;
    const suspended = await new WorkflowTriggers(f.services).revalidate(original.id, original.revision);
    expect(suspended.state).toBe("suspended");
    expect(suspended.diagnostic).toMatchObject({ code: "RESOURCE_SCHEMA_CHANGED" });
    expect(suspended.diagnostic!.path).toContain("id");
    await receiveWorkflowMessage(f.services, f.event, context);
    expect(f.store.runRecords.size).toBe(0);
    expect(f.calls).toEqual([]);
    await expect(f.triggers.update(suspended.id, suspended.revision, "workflow", 1, "admin")).rejects.toHaveProperty(
        "code",
        "INVALID_DEFINITION",
    );
});
test("an unavailable schema resolver defers revalidation and keeps consumer state unchanged", async () => {
    const f = await active();
    f.services.contracts.resolveEventSchema = async () => {
        throw new WorkflowError("CORE_UNAVAILABLE");
    };
    const original = (await f.store.trigger("trigger"))!;
    await expect(f.triggers.revalidate(original.id, original.revision)).rejects.toHaveProperty(
        "code",
        "CORE_UNAVAILABLE",
    );
    expect(await f.store.trigger("trigger")).toEqual(original);
});

test("a conflicting resource version blocks new publication with its schema diagnostic", async () => {
    const f = await active();
    const draft = (await f.store.draft("workflow"))!;
    await f.definitions.create("conflicting", draft.definitionJson, "{}");
    f.services.contracts.resolveEventSchema = async () => {
        throw new WorkflowError("RESOURCE_SCHEMA_CHANGED", "trigger.resource.version");
    };
    expect(await f.definitions.validate("conflicting", 1)).toEqual({
        valid: false,
        issues: [{ code: "INVALID_DEFINITION", path: "trigger.resource.version" }],
    });
    await expect(f.definitions.publish("conflicting", 1)).rejects.toMatchObject({
        code: "INVALID_DEFINITION",
        path: "trigger.resource.version",
    });
    expect(await f.store.plan("conflicting", 1)).toBeNull();
});

test("a missing resource selection is a blocking validation diagnostic and cannot publish a plan", async () => {
    const f = domainFixture();
    Object.assign(f.source, {
        schema: {
            type: "object",
            properties: {
                formId: { type: "string", maxLength: 64 },
                answers: {
                    type: "resolved",
                    resolver: "forms.describe",
                    selector: { formId: { source: "value", path: "/formId" } },
                },
            },
            required: ["formId", "answers"],
        },
        filterKeys: ["formId"],
    });
    f.services.contracts.resolveEventSchema = async () => {
        throw new SchemaResolutionError("INVALID_SELECTOR", "/answers");
    };
    await f.definitions.create("missing-selection", JSON.stringify(document), "{}");
    expect(await f.definitions.validate("missing-selection", 1)).toEqual({
        valid: false,
        issues: [{ code: "INVALID_DEFINITION", path: "trigger.schemaSelectorMustBeKnown" }],
    });
    await expect(f.definitions.publish("missing-selection", 1)).rejects.toMatchObject({
        code: "INVALID_DEFINITION",
        path: "trigger.schemaSelectorMustBeKnown",
    });
    expect(await f.store.plan("missing-selection", 1)).toBeNull();
    expect(f.calls).toEqual([]);
});

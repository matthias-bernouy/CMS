# Authoring resolved schemas

Events and capability DTOs use the same native schema. A form-like event can be authored with the SDK:

```ts
const submitted = defineEvent({
    id: "submission.created",
    sensitive: false,
    filterKeys: ["formId"],
    schema: z.strictObject({
        formId: contractString({ maxLength: 64 }),
        formVersion: z.int(),
        answers: contractResolved({
            resolver: "forms.describe",
            choices: "forms.choices",
            selector: { formId: { source: "value", path: "/formId" } },
            version: { source: "value", path: "/formVersion" },
        }),
    }),
});
```

The referenced resolver and picker must be capabilities in the same effective contract. The optional picker uses the standard paginated choices protocol (`schemaChoicesFor`); omit `choices` when no picker is needed. Inherited capabilities follow exact contract lineage admission.

```ts
const describe = schemaResolversFor<Services>()({
    id: "forms.describe",
    path: "/forms/describe",
    selector: z.strictObject({ formId: contractString({ maxLength: 64 }) }),
    authorize: ({ context }) => servicesPolicy(context),
    execute: async ({ selector, input, services }) => {
        const form = await services.forms.version(selector.formId, input.version);
        return schemaDescriptorWire({
            resourceId: form.id,
            version: String(form.version),
            schema: form.answerSchema,
            fields: form.fieldDescriptors,
        });
    },
});
```

`selector` in the executor/guard is typed from the declared selector schema. Its original wire input remains `{selectorJson, version?}`. `form.answerSchema` above must be a concrete native `UlviaSchema`, using the same primitives, objects, arrays and bounded maps as a capability. `fields` can be empty; otherwise each stable field ID/property is unique and names a root object property. Labels do not define identity. `schemaDescriptorWire` owns validation, serialization and hashing. A changed schema or field sensitivity must get a new version; the Provider's durable store refuses conflicting versions.

The SDK's `contractResolved` has TypeScript value type `unknown`, since installation data is unavailable to TypeScript. This does not weaken runtime validation. An editor reads the admitted node, calls its picker, then calls its resolver to offer concrete fields. Workflow publication uses that same descriptor and rejects unavailable or incompatible mappings. No feature reimplements a separate schema vocabulary.

For a capability input, use the same `answers` node beside its required `formId` and optional explicit version metadata. For a capability output, use `source: "input"` when the selected resource comes from the input:

```ts
answers: contractResolved({
    resolver: "forms.describe",
    selector: { formId: { source: "input", path: "/formId" } },
    version: { source: "input", path: "/formVersion" },
})
```

Selectors cannot reference another dynamic field, an optional/nullable property or item-local array metadata. Capability resolvers and their optional pickers cannot require a greater access level than their consumer. An ADMIN-only picker therefore cannot be attached to a public capability; omit the picker or provide one with compatible access. HTTP query/path/header parameters remain static scalars; dynamic JSON belongs in a JSON body. MCP discovery exposes resolver metadata rather than a fictitious concrete type; invocation still validates the native resolved schema.

CMS Gateway hosts must also supply `CapabilityGatewayOptions.schemaVersions`: a durable CMS authority is required before accepting resolver results. The official runtime supplies it and the Edge uses the private `gateway.schemas.seal` control binding, with actor/source revalidation. External Providers cannot bypass that seal by skipping the SDK.

Host configuration is explicit: `createProvider` requires `schemaVersions` when mounting a resolver, and resolver invocations require their verified installation `connectionId`. Seals remain distinct for two accounts/installations on the same Provider instance. `MongoSchemaVersions` is exported from `@bernouy/cms-gateway/provider/schema-mongo`. Supply `resolveSchema` for default durable workers or retained dynamic output projections; it must preserve the stored invocation's exact scope, resolver authorization and version seal. `executeCapability` from `@bernouy/ulvia-sdk/local` requires `schemaResolution` for dynamic schemas and resolver execution. There is no in-memory production fallback.

Workflow V1 resolves selectors known from literals and installation parameters. Unknown future-step/manual inputs or selectors found only in a future result cannot establish static bindings and block publication. A trigger's `filter` only selects events; dynamic schema references remain in the source declaration. Source changes remain independent across Providers: compatible changes continue, consumed-field incompatibilities suspend with diagnostics, outages defer checks.

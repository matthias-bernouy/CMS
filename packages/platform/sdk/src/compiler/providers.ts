import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { CompiledProvider, ProviderDefinition } from "ulvia-sdk/interfaces/providers";
import { compileImplementations } from "ulvia-sdk/compiler/implementations";
import { buildCatalogue } from "ulvia-sdk/compiler/catalogue";
import { providerPlan, storeProviderPlan } from "ulvia-sdk/compiler/plan";
import { compileSchema } from "ulvia-sdk/schema/compile";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** One static handler table drives both manifest claims and runtime registration. */
export async function compileProvider<Dependencies>(
    definition: ProviderDefinition<Dependencies>,
): Promise<CompiledProvider<Dependencies>> {
    const { implementations, configuration: configSource, dependencies = [], ...metadata } = definition;
    const configuration = compileSchema(configSource, "$.configuration");
    if (configuration.type !== "object" || configuration.nullable) {
        throw new SdkDefinitionError("Provider configuration must be a nonnullable object", "$.configuration");
    }
    const capturedMetadata = structuredClone(metadata);
    const compiled = await compileImplementations(implementations, dependencies);
    const manifest = await admitProviderManifest(
        {
            ...capturedMetadata,
            configuration,
            implementations: compiled.implementations,
            kind: "provider-manifest",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
        },
        buildCatalogue(compiled.contracts),
    );
    const build = Object.freeze({ ...compiled, manifest }) as CompiledProvider<Dependencies>;
    storeProviderPlan(build, providerPlan(compiled));
    return build;
}

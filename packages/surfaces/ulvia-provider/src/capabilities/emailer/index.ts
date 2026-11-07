import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import { registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import type { ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import { smtpEmailerImplementation } from "./implementation";
import type { CmsSmtpEmailerDependencies } from "./implementation";

export type { CmsSmtpEmailerDependencies } from "./implementation";
let compilation: ReturnType<typeof compileImplementations<CmsSmtpEmailerDependencies>> | undefined;

export async function registerSmtpEmailerCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsSmtpEmailerDependencies,
    options: ProviderRegistrationOptions,
): Promise<void> {
    compilation ??= compileImplementations([smtpEmailerImplementation]);
    registerProviderHandlers(await compilation, dispatcher, dependencies, options);
}

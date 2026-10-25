declare const __ULVIA_CLI_VERSION__: string | undefined;
declare const __ULVIA_DEFAULT_STACK_VERSION__: string | undefined;

const injectedCliVersion = typeof __ULVIA_CLI_VERSION__ === "string" ? __ULVIA_CLI_VERSION__ : undefined;
const injectedStackVersion =
    typeof __ULVIA_DEFAULT_STACK_VERSION__ === "string" ? __ULVIA_DEFAULT_STACK_VERSION__ : undefined;

export const CLI_VERSION = injectedCliVersion ?? "development";
export const DEFAULT_STACK_VERSION = injectedStackVersion ?? "unbundled";

export function defaultStackVersion(): string {
    if (!injectedStackVersion) {
        throw new Error(
            "This development CLI has no bundled stack version. Pass --version <version> on the first start.",
        );
    }
    return injectedStackVersion;
}

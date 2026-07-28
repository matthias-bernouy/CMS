import { isDeepStrictEqual } from "node:util";
import type { DeclarativeConnectorFunctionTemplate, DeclarativeConnectorTemplate } from "@bernouy/cms-integrations";

export function functionImplementationChanged(
    baselineConnector: DeclarativeConnectorTemplate,
    baseline: DeclarativeConnectorFunctionTemplate,
    candidateConnector: DeclarativeConnectorTemplate,
    candidate: DeclarativeConnectorFunctionTemplate,
    changedPaths: ReadonlySet<string>,
): boolean {
    const prefixes = [functionRoot(baselineConnector, baseline), functionRoot(candidateConnector, candidate)];
    const configs = [functionConfig(baselineConnector, baseline), functionConfig(candidateConnector, candidate)].filter(
        (path): path is string => path !== undefined,
    );
    return (
        !isDeepStrictEqual(deploymentMetadata(baseline), deploymentMetadata(candidate)) ||
        [...changedPaths].some(
            (changedPath) =>
                prefixes.some((prefix) => changedPath === prefix || changedPath.startsWith(`${prefix}/`)) ||
                configs.includes(changedPath),
        )
    );
}

function deploymentMetadata(fn: DeclarativeConnectorFunctionTemplate) {
    return { directory: fn.directory, configPath: fn.configPath, secrets: fn.secrets };
}

function functionRoot(connector: DeclarativeConnectorTemplate, fn: DeclarativeConnectorFunctionTemplate): string {
    return joinPackagePath(connector.root, fn.directory);
}

function functionConfig(
    connector: DeclarativeConnectorTemplate,
    fn: DeclarativeConnectorFunctionTemplate,
): string | undefined {
    return fn.configPath ? joinPackagePath(connector.root, fn.configPath) : undefined;
}

function joinPackagePath(root: string | undefined, path: string): string {
    return [root, path]
        .filter(Boolean)
        .join("/")
        .replace(/^\.\//, "")
        .replaceAll(/\/{2,}/g, "/");
}

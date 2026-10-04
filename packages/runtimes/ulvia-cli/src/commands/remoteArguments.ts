import type { RemoteCoordinate } from "../repository/remote/client";
import type { RepositoryArtifactKind } from "../repository/yanks";

export type RemoteAction = "pull" | "push" | "restore" | "yank";

export function parseRemoteArguments(
    action: RemoteAction,
    args: readonly string[],
    environment: Record<string, string | undefined>,
) {
    const positional: string[] = [];
    let repositoryUrl = environment.ULVIA_REPOSITORY_URL?.trim();
    let reason: string | undefined;
    for (let index = 0; index < args.length; index++) {
        const argument = args[index]!;
        if (argument === "--repository") {
            repositoryUrl = requiredOption(args[++index], "--repository");
        } else if (argument === "--reason") {
            reason = requiredOption(args[++index], "--reason");
        } else {
            positional.push(argument);
        }
    }
    if (positional.length !== 2 || !repositoryUrl || (action === "yank" && !reason)) {
        throw new Error(
            `Usage: ulvia ${action} <collection|contract|provider> <publisher/id@version> --repository <url>${action === "yank" ? " --reason <text>" : ""}`,
        );
    }
    if ((action === "pull" || action === "push" || action === "restore") && reason) {
        throw new Error(`--reason is only valid with ulvia yank`);
    }
    return { coordinate: parseCoordinate(positional[0]!, positional[1]!), repositoryUrl, reason };
}

export function formatCoordinate(value: RemoteCoordinate): string {
    return `${value.kind} ${value.publisherId}/${value.id}@${value.version}`;
}

function parseCoordinate(kindValue: string, value: string): RemoteCoordinate {
    const kind = normalizeKind(kindValue);
    const separator = value.lastIndexOf("@");
    const slash = value.indexOf("/");
    const publisherId = value.slice(0, slash);
    const id = value.slice(slash + 1, separator);
    const version = value.slice(separator + 1);
    if (
        slash < 1 ||
        separator <= slash + 1 ||
        !IDENTIFIER.test(publisherId) ||
        !IDENTIFIER.test(id) ||
        !VERSION.test(version)
    ) {
        throw new Error("Repository coordinate must use publisher/id@version");
    }
    return { kind, publisherId, id, version };
}

function normalizeKind(value: string): RepositoryArtifactKind {
    if (value === "provider") {
        return "provider-manifest";
    }
    if (value === "collection" || value === "contract") {
        return value;
    }
    throw new Error("Repository kind must be collection, contract, or provider");
}

function requiredOption(value: string | undefined, name: string): string {
    if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value`);
    }
    return value;
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

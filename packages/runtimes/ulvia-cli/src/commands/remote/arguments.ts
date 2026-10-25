import type { RemoteCoordinate, RepositoryArtifactKind } from "@bernouy/cms-repository/repository/publication";

export type RemoteAction = "pull" | "push" | "restore" | "yank";
export type RemoteSelection =
    | { mode: "all" }
    | ({ mode: "one"; kind?: RepositoryArtifactKind } & Omit<RemoteCoordinate, "kind">);

export function parseRemoteArguments(
    action: RemoteAction,
    args: readonly string[],
    environment: Record<string, string | undefined>,
) {
    const positional: string[] = [];
    const options = new Map<string, string>();
    for (let index = 0; index < args.length; index++) {
        const argument = args[index]!;
        if (argument.startsWith("--")) {
            const value = args[++index];
            if (
                !["--repository", "--reason"].includes(argument) ||
                options.has(argument) ||
                !value ||
                value.startsWith("--")
            ) {
                throw new Error(remoteUsage(action));
            }
            options.set(argument, value);
        } else {
            positional.push(argument);
        }
    }
    const reason = options.get("--reason");
    if ((action === "yank" && !reason) || (action !== "yank" && reason)) {
        throw new Error(remoteUsage(action));
    }
    let selection: RemoteSelection;
    if (action === "push" && positional.length === 1 && positional[0] === "all") {
        selection = { mode: "all" };
    } else if (action === "push" && positional.length === 1) {
        selection = { mode: "one", ...parseCoordinate(positional[0]!) };
    } else if (positional.length === 2) {
        selection = { mode: "one", kind: normalizeKind(positional[0]!), ...parseCoordinate(positional[1]!) };
    } else {
        throw new Error(remoteUsage(action));
    }
    const repositoryUrl = options.get("--repository") ?? environment.ULVIA_REPOSITORY_URL?.trim();
    if (!repositoryUrl) {
        throw new Error("No Repository selected. Run ulvia repository login <url> or use --repository <url>.");
    }
    return { selection, repositoryUrl, reason };
}

export function formatCoordinate(value: RemoteCoordinate): string {
    return `${value.kind} ${value.publisherId}/${value.id}@${value.version}`;
}

export function remoteUsage(action: RemoteAction): string {
    return action === "push"
        ? "Usage: ulvia push <publisher/id@version | all> [--repository <url>] (add a kind before the coordinate only to resolve ambiguity)"
        : `Usage: ulvia ${action} <collection|contract|provider> <publisher/id@version> [--repository <url>]${action === "yank" ? " --reason <text>" : ""}`;
}

function parseCoordinate(value: string): Omit<RemoteCoordinate, "kind"> {
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
    return { publisherId, id, version };
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

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

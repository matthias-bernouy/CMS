import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { formatCoordinate, parseRemoteArguments, remoteUsage, type RemoteAction } from "./arguments";
import { RemoteAssetFileSink } from "./assetSink";
import { storeLocal } from "./storage";
import { pushCommand } from "./push";
import { remoteRepositoryCredential } from "../namespace/credentials";

export async function remoteCommand(
    action: RemoteAction,
    args: readonly string[],
    repositoryRoot: string,
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
): Promise<void> {
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(remoteUsage(action));
        return;
    }
    const { selection, repositoryUrl, reason } = parseRemoteArguments(action, args, environment);
    if (action === "push") {
        await pushCommand(selection, repositoryUrl, repositoryRoot, environment, log);
        return;
    }
    if (selection.mode !== "one" || !selection.kind) {
        throw new Error(remoteUsage(action));
    }
    const coordinate = {
        kind: selection.kind,
        publisherId: selection.publisherId,
        id: selection.id,
        version: selection.version,
    };
    const client = new RemoteRepositoryClient(
        repositoryUrl,
        action === "pull"
            ? undefined
            : await remoteRepositoryCredential(repositoryUrl, coordinate.publisherId, environment),
    );
    if (action === "yank" || action === "restore") {
        await client.yank(coordinate, action === "restore" ? null : reason!);
        log(`${action === "restore" ? "Restored" : "Yanked"} ${formatCoordinate(coordinate)}`);
        return;
    }
    const sink = new RemoteAssetFileSink(repositoryRoot);
    const remote = await client.pull(coordinate, sink);
    let added: boolean;
    try {
        added = await withRepositoryWriteLock(repositoryRoot, () => storeLocal(repositoryRoot, remote));
    } finally {
        await sink.complete();
    }
    log(`${added ? "+" : "="} ${formatCoordinate(coordinate)} (${remote.expectedDigest})`);
}

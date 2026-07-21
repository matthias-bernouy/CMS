type DirectoryMove = { source: string; destination: string };

function isInside(path: string, directory: string): boolean {
    return path.startsWith(`${directory}/`);
}

function candidateMoves(destination: string, source: string): DirectoryMove[] {
    const destinationParts = destination.split("/");
    const sourceParts = source.split("/");
    let commonSuffix = 0;
    while (
        commonSuffix < destinationParts.length &&
        commonSuffix < sourceParts.length &&
        destinationParts[destinationParts.length - commonSuffix - 1] ===
            sourceParts[sourceParts.length - commonSuffix - 1]
    ) {
        commonSuffix += 1;
    }
    const moves: DirectoryMove[] = [];
    for (let nested = 0; nested < commonSuffix; nested += 1) {
        const destinationLength = destinationParts.length - commonSuffix + nested;
        const sourceLength = sourceParts.length - commonSuffix + nested;
        if (destinationLength === 0 || sourceLength === 0) continue;
        const destinationDirectory = destinationParts.slice(0, destinationLength).join("/");
        const sourceDirectory = sourceParts.slice(0, sourceLength).join("/");
        if (destinationDirectory !== sourceDirectory) {
            moves.push({ source: sourceDirectory, destination: destinationDirectory });
        }
    }
    return moves;
}

function isPureMove(
    move: DirectoryMove,
    baselinePaths: readonly string[],
    currentPaths: ReadonlySet<string>,
    renamedFiles: ReadonlyMap<string, string>,
): boolean {
    if (baselinePaths.some((path) => path === move.destination || isInside(path, move.destination))) return false;
    if ([...currentPaths].some((path) => path === move.source || isInside(path, move.source))) return false;
    const sourcePaths = baselinePaths.filter((path) => isInside(path, move.source));
    if (sourcePaths.length === 0) return false;
    return sourcePaths.every((sourcePath) => {
        const relativePath = sourcePath.slice(move.source.length + 1);
        const destinationPath = `${move.destination}/${relativePath}`;
        return currentPaths.has(destinationPath) && renamedFiles.get(destinationPath) === sourcePath;
    });
}

export function inferPureDirectoryRenames(
    baselinePaths: readonly string[],
    currentPaths: readonly string[],
    renamedFiles: ReadonlyMap<string, string>,
): Map<string, string> {
    const current = new Set(currentPaths);
    const candidates = new Map<string, DirectoryMove>();
    for (const [destination, source] of renamedFiles) {
        for (const move of candidateMoves(destination, source)) {
            candidates.set(`${move.destination}\0${move.source}`, move);
        }
    }
    const valid = [...candidates.values()].filter((move) =>
        isPureMove(move, baselinePaths, current, renamedFiles),
    );
    const sourcesByDestination = new Map<string, Set<string>>();
    const destinationsBySource = new Map<string, Set<string>>();
    for (const { source, destination } of valid) {
        const sources = sourcesByDestination.get(destination) ?? new Set<string>();
        sources.add(source);
        sourcesByDestination.set(destination, sources);
        const destinations = destinationsBySource.get(source) ?? new Set<string>();
        destinations.add(destination);
        destinationsBySource.set(source, destinations);
    }
    const renames = new Map<string, string>();
    for (const { source, destination } of valid) {
        if (sourcesByDestination.get(destination)?.size !== 1) continue;
        if (destinationsBySource.get(source)?.size !== 1) continue;
        renames.set(destination, source);
    }
    return new Map([...renames].sort(([left], [right]) => left.localeCompare(right)));
}

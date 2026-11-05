import { releaseChannel } from "cms-repository/exports/contracts/compatibility";
import { fusedRanking, lexicalRanking, semanticRanking } from "@bernouy/text-search";
import type { RepositorySearchQuery, RepositorySearchRow } from "../interfaces";

export function searchRows(rows: readonly RepositorySearchRow[], query: RepositorySearchQuery) {
    return rows.filter(
        (row) =>
            (query.channel === "all" || releaseChannel(row.reference.version) === (query.channel ?? "stable")) &&
            (!query.kinds || query.kinds.includes(row.blocId ? "bloc" : row.reference.kind)) &&
            (!query.publisherId || query.publisherId === row.reference.publisherId) &&
            (!query.contractId || row.contractIds.includes(query.contractId)),
    );
}

export function rankRows(
    rows: readonly RepositorySearchRow[],
    query: string,
    vectors?: readonly (readonly number[])[],
    embedding?: readonly number[],
) {
    const lexical = lexicalRanking(
        rows.map((row) => row.text),
        query,
    );
    const ranking = vectors && embedding ? fusedRanking(lexical, semanticRanking(vectors, embedding)) : lexical;
    const exact = query.trim().toLowerCase();
    const matches = rows.flatMap((row, index) =>
        [row.blocId, row.reference.id].some((id) => id?.toLowerCase() === exact) ? [index] : [],
    );
    const matched = new Set(matches);
    return [...matches, ...ranking.filter((index) => !matched.has(index))];
}

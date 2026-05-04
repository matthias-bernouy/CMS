import type { StorageProvider } from "../../../exports/StorageProvider";
import type { PreSignedToken } from "../../../interfaces/entities/PreSignedToken";

/**
 * Atomic single-use consumption. The repo's `tryConsume` returns the token
 * only on the very first call; subsequent calls — including those racing in
 * parallel — see `null`. The expiry check happens after the consume to give
 * a precise error code, since Mongo's TTL monitor may not have run yet.
 */
export async function consumeToken(provider: StorageProvider, tokenId: string): Promise<PreSignedToken> {
    if (!tokenId) throw new Error("invalid_token: missing token id.");

    const token = await provider.preSignedTokenRepo.tryConsume(tokenId);
    if (!token) throw new Error("invalid_token: token unknown or already consumed.");

    if (token.expiresAt.getTime() <= Date.now()) {
        throw new Error("invalid_token: token has expired.");
    }

    return token;
}

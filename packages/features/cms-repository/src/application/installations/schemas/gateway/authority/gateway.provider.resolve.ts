import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayProviderResolveInputSchema = z.strictObject({
    token: contractString({ maxLength: 4096, sensitive: true }),
});

export const gatewayProviderResolveOutputSchema = z.strictObject({
    installationId: contractString({ maxLength: 128 }).nullable(),
});

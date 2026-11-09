import { contractString, z } from "@bernouy/ulvia-sdk";

const id = contractString({ minLength: 1, maxLength: 128 });
const hostnameSchema = contractString({ minLength: 1, maxLength: 253 });
export const instanceIdInput = z.strictObject({ instanceId: id });
export const instanceSchema = z.strictObject({
    id,
    label: contractString({ minLength: 1, maxLength: 80 }),
    origin: contractString({ minLength: 1, maxLength: 2048 }),
    status: z.enum(["provisioning", "upgrading", "ready", "failed", "disabled"]),
    revision: z.int().min(1),
    createdAt: contractString({ maxLength: 64 }),
    updatedAt: contractString({ maxLength: 64 }),
});
export const pageInput = z.strictObject({ after: id.nullable(), limit: z.int().min(1).max(50) });
export const instancePage = z.strictObject({ items: z.array(instanceSchema).max(50), nextCursor: id.nullable() });
export const domainSchema = z.strictObject({
    hostname: hostnameSchema,
    origin: contractString({ minLength: 1, maxLength: 2048 }),
    instanceId: id,
    state: z.enum(["pending", "verified", "active", "disabled"]),
    tls: z.enum(["pending", "ready", "failed", "not-required"]),
    revision: z.int().min(1),
});
const proofSchema = z.strictObject({
    name: contractString({ minLength: 1, maxLength: 260 }),
    value: contractString({ minLength: 1, maxLength: 256 }),
});
export const createInstanceInput = z.strictObject({
    requestId: contractString({ format: "uuid", maxLength: 36 }),
    label: contractString({ minLength: 1, maxLength: 80 }),
    origin: contractString({ minLength: 1, maxLength: 2048 }),
    administrator: z.strictObject({
        email: contractString({ minLength: 1, maxLength: 254 }),
        password: contractString({ sensitive: true, minLength: 12, maxLength: 1024 }),
    }),
});
export const createInstanceOutput = z.strictObject({
    instance: instanceSchema,
    domain: domainSchema,
    proof: proofSchema.nullable(),
});
export const domainPageInput = z.strictObject({
    instanceId: id,
    after: hostnameSchema.nullable(),
    limit: z.int().min(1).max(50),
});
export const domainPage = z.strictObject({
    items: z.array(domainSchema).max(50),
    nextCursor: hostnameSchema.nullable(),
});
export const claimDomainInput = z.strictObject({
    instanceId: id,
    origin: contractString({ minLength: 1, maxLength: 2048 }),
});
export const claimDomainOutput = z.strictObject({ domain: domainSchema, proof: proofSchema });
export const changeDomainInput = z.strictObject({ hostname: hostnameSchema, expectedRevision: z.int().min(1) });

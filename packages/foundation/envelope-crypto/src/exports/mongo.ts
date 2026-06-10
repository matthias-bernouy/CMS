/**
 * Mongo adapter of @bernouy/envelope-crypto — imported by composition roots only,
 * never by surfaces or libs that just consume the `DekRepository` contract.
 */

export { MongoDekRepository, type CmsDekDocument } from "envelope-crypto/default-implementation/MongoDekRepository";
export { createFieldCrypto } from "envelope-crypto/core/FieldCrypto";

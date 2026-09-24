# Protocol v1 provider fixture

`example.provider-manifest.json` is an executable provider-manifest fixture. It
implements the representative `protocol.examples@1.0.0` contract by exact
digest and requires `communication.email/email.message.send` through the CMS
gateway.

Range comparator and union order is canonicalized by the contracts range
engine. The fixture's manifest digest reflects that normalization. Multiple
exact releases of a contract may appear in `implementations`; each needs its
own version and digest, not an inferred claim for a whole major.

The endpoint entries are allowed origins, not an installed endpoint. Credential
entries are declarations only; manifest files never contain secret values or
installation-owned secret references.

[Connection V1 fixtures](connection/README.md) document the separate CMS-owned
installation, runtime report, and gateway-bootstrap shapes. Their route
metadata does not mount or call any endpoint.

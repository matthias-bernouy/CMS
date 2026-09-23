# Protocol v1 fixtures

`representative.contract.json` is an executable contract fixture covering:

- a paginated query;
- a keyed command and declared business error;
- binary upload and download;
- a long-running operation with a binary final result;
- a change feed and snapshot bootstrap.

Provider requirements belong to the future provider-manifest fixture. Collection
blocs and back-office views belong to their future resource packages; they must
reference this contract format rather than extending it.

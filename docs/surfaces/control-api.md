# Legacy Control API

The file-routed `/api/*` Control transport is no longer mounted. Installed
collection and site Control Pages use the same stable transports as every other
surface:

- `/.cms/call/<contract>/<capability>` for versioned provider capabilities;
- `/.cms/files/*` for bounded author-file operations;
- `/.cms/style` and `/.cms/blocset` for the exact Page presentation runtime.

`packages/surfaces/cms-control/src/api/` remains temporarily as unmounted source
while useful implementation logic and tests are moved to owning feature
packages or deleted. It is not a compatibility surface and must not receive new
endpoints. Likewise, retained legacy component sources are no longer registered
in the production browser bundle.

New Control behavior belongs in a versioned contract implementation, with its
UI delivered by a Control Page and collection Blocs. Authentication bootstrap
routes under `/auth/*` remain kernel-owned because they establish the subject
required before a Control Page or capability can run.

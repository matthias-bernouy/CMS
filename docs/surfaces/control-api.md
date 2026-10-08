# Legacy Control API

The file-routed `/api/*` Control transport is no longer mounted. Installed
collection and site Control Pages use the same stable transports as every other
surface:

- `/.cms/call/<contractId><binding.path>` for versioned provider capabilities,
  including binary file operations;
- `/.cms/style` and `/.cms/blocset` for the exact Page presentation runtime.

The former `packages/surfaces/cms-control/src/api/` handlers and surface-owned
administration components have been deleted. There is no dormant compatibility
tree: new administration operations must be versioned capabilities, while
authentication stays an explicit kernel transport.

An architecture test scans the official Control collection: browser-side
management `fetch` calls and declarative `cms-source` management requests must
target `/.cms/call`. There is no file-specific transport exemption.

New Control behavior belongs in a versioned contract implementation, with its
UI delivered by a Control Page and collection Blocs. Authentication bootstrap
routes under `/auth/*` remain kernel-owned because they establish the subject
required before a Control Page or capability can run.

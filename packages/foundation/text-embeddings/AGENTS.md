# @bernouy/text-embeddings

Local E5 embedding adapter. Keep the abstract Embeddings port in @bernouy/text-search. Runtimes inject cache/model options and own initialization/shutdown. Do not import CMS packages or read environment configuration.

Start native inference in a subprocess with an explicit environment whitelist,
including `ORT_DISABLE_TELEMETRY=1` before native SDK initialization. Never
inherit host credentials or substitute a thread-local JavaScript environment
write for native startup configuration. Drain accepted inference on graceful
close, dispose on parent disconnection and propagate abnormal child exits.

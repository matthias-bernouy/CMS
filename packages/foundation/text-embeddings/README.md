# @bernouy/text-embeddings

Local CPU E5 embeddings through a pinned, quantized ONNX model in an isolated
child process. The child starts with native telemetry disabled and does not
inherit host credentials. It drains active inference before graceful shutdown;
parent IPC disconnection also disposes its model. This package owns
Transformers.js and native dependencies. Runtimes explicitly compose it with the
backend-independent `Embeddings` port from `@bernouy/text-search`.

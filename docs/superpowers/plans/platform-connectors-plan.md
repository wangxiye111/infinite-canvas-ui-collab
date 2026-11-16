# Platform Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement independent tasks and review the integrated result.

**Goal:** Deliver the approved five-platform connection UI, local execution bridge, resumable jobs, and GLB canvas nodes.

**Architecture:** A loopback Node service serves the existing Vite build and platform API. Provider modules implement real HTTP/official CLI adapters; the React canvas uses registered extension nodes and existing local media storage.

**Tech Stack:** Node ESM, built-in HTTP/crypto/fs, React/TypeScript/Zustand/localForage, existing theme, Three.js for GLB.

**Spec:** ../specs/platform-connectors-design.md

## Global Constraints

- Preserve existing credentials/data and the currently served dist. No remote push/merge or charged generation.
- Target Kling CN, Tripo CN, Liblib.art; distinguish membership and API credits.
- No arbitrary shell, credential echo, silent paid retry, or unsupported cancellation claims.
- Follow AGENTS.md themes and API/store locations. Treat real account verification as pending until actually performed.

## Task 1: Local service and durable jobs (root)

Files: canvas-connectors/package.json, src/server.mjs, src/store.mjs, src/jobs.mjs, test/service.test.mjs; .gitignore and web/vite.config.ts only as needed.

- [x] Write node:test cases for duplicate requestId returning one job, credentials never present in public provider responses, interrupted submissions not resubmitted on reload, invalid Origin rejected.
- [x] Implement persisted config/jobs/files with atomic JSON replacement and restricted permissions; only UUID file IDs are accepted.
- [x] Implement spec routes and same-origin static serving. Inject provider list and fetch/runCli dependencies for offline tests.
- [x] Test a fake provider completing an image task and reloading its result without another submit call.

## Task 2: Real provider adapters (provider agent)

Files: canvas-connectors/src/providers/*.mjs, canvas-connectors/test/providers.test.mjs.

Consumes: createProviders(ctx) and complete adapter contract in spec. Produces: default export createProviders(ctx), array covering kling/jimeng/runninghub/tripo/liblib.

- [x] Write request-contract tests using fake fetch/runCli; assert official host, route, auth/signature and genuine remote task IDs.
- [x] Implement CN Kling official CLI and official dreamina route; inspect CLI help/schema without account generation. Do not infer new CLI machine fields.
- [x] Implement RH app/workflow and Liblib workflow upload/submit/query; bind prompt/file inputs using explicit preset params.
- [x] Implement Tripo CN v3 text/image generation and task query.
- [x] Run tests; document precise live-auth or unsupported action boundaries.

## Task 3: Platform settings, presets and task node (frontend agent)

Files: web/src/services/api/connectors.ts, web/src/stores/use-connectors-store.ts, web/src/components/connectors/{connector-manager,connector-task-node}.tsx, connectors node definitions module. Root owns registration/bootstrap and general canvas types.

Consumes: HTTP contract in spec. Produces: ConnectorManager component, connectorNodeDefinitions export, strongly typed client, persistent local presets. 3D result node uses type connectors:model3d.

- [x] Build five cards with connection states, secret-preserving config edits, user-triggered login/check and visible errors.
- [x] Add named presets and a task node which reads connected input nodes, uploads assets, and submits with a unique requestId.
- [x] Save returned job ID in node metadata; refresh queries that job and imports each output once into existing asset storage.
- [x] Expose job progress/error and supported cancellation; don't silently select/submit paid defaults.
- [x] Verify loading/unavailable states and theme integration; coordinate root registration and current-canvas association.

## Task 4: GLB node (3D agent)

Files: web/src/components/connectors/model3d-node.tsx, web/src/lib/connectors/model3d.ts; canvas-export.ts 3D extension mappings. Root adds npm dependencies.

Consumes: CanvasNodeContext, shared file-storage/image-storage; node type connectors:model3d; metadata.storageKey/content for binary and optional model3d record. Produces: model3dNodeDefinition export and importGLB(file):Promise<CanvasNodeMetadata> helper.

- [x] Implement local GLB import, shared media storage, lazy Three.js GLTFLoader/OrbitControls rendering with cleanup.
- [x] Add download and screenshot-to-image-node; preserve screenshot in image-storage and link it to model node.
- [x] Include correct .glb ZIP export mapping; use saved storageKey so refresh/import can restore object URL.
- [x] Exercise a small generated local GLB sample in independent browser; verify geometry visible, screenshot node produced and model downloadable.

## Task 5: Integration and review (root)

- [x] Register both node definitions through current registry, expose platform settings from canvas and top navigation, add explicit import entry.
- [x] Run targeted service/provider tests and existing affected regressions; build candidate web output separately. Use only local mocked jobs for automated end-to-end execution.
- [x] Independent code review for credential disclosure, repeated charges, lost output assets, unsupported account claims and UI state correctness; fix material findings.
- [x] Browser verify five cards and GLB node on independent candidate origin, then serve approved scope on original port while retaining old dist backup.
- [x] Update CHANGELOG Unreleased and todo/pending-test with implementation versus real account acceptance accurately separated. Do not release/bump/tag/push.

## Progress

User approved this scope in conversation. Implementation is on branch codex/platform-connectors. The original 3000 port now serves the local connector service and upgraded UI. Existing v0.20.0 build is preserved at ../canvas-build-backup-v0.20.0-20261109. No main merge, push, version bump or tag.

Validation: 21 Node service/provider tests, 5 GLB validation tests, TypeScript typecheck and candidate production build passed. Browser checks covered five connection cards, preset save/selection, disabled generation before authorization, GLB import/rotation/screenshot/download/refresh and ZIP assets. Independent review findings were fixed.

Account acceptance is still pending: no login or paid generation was performed. Kling CN CLI 0.2.3 is installed and help runs. The old official Jimeng macOS ARM binary could not run and its original download failed signature verification; it was not installed. The adapter validates runtime help before any eventual submission. Liblib upload schema was rechecked directly against its official sub-document and xOss field capitalization corrected. These implementation checkboxes do not assert live-account acceptance.

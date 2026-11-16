# UI collaboration handoff

Start with the [English brief](brief.en.md) or [中文需求](brief.zh-CN.md). This is a source snapshot for design collaboration, derived from [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas). The original MIT license and attribution remain intact.

## Included / excluded

Included: the current application source, generic CLI/provider integration code, tests and project documentation. Excluded: real Kling/Jimeng/Codex/Gemini configuration and credentials, API keys, runtime data, projects/media histories, browser exports, logs, local dependencies, build outputs and the original Git history. No account access is granted by this repository.

Cue references are identified for discussion. A recreation is not a claim that the original Cue source was obtained or that third-party assets have been relicensed.

## UI-only development

Use Bun and a current Node.js version compatible with the project (the connector package requires Node 22 or newer). In a fresh clone:

```sh
cd web
bun install
bun run dev
```

Open the address printed by Vite (normally port 3000). This opens the frontend for visual work. Real generation and local-agent features need separately configured services/accounts; missing-connection states are expected in a clean checkout. Use sample media and mock task states for design review. No production credentials should be added to fixtures.

## Optional full local development

From the repository root, install dependencies:

```sh
npm --prefix canvas-connectors ci
npm --prefix canvas-agent ci
```

After installing the frontend dependencies, run:

```sh
node start-dev.mjs
```

The source preview runs at `http://127.0.0.1:5173`, starts/reuses the local Agent, and starts the connector service. It creates local runtime files outside the tracked source. Install/login to providers only with your own authorized accounts when live testing is needed. The collaborator does not need these accounts for the initial design proposal.

These commands are based on the checked-in scripts; a clean-machine installation and macOS behavior still require verification. No build or generation was run for the sharing task.

## Code map

| Area | Location |
| --- | --- |
| Canvas page and UI | `web/src/pages/canvas/`, `web/src/components/canvas/` |
| Canvas state / behavior | `web/src/stores/canvas/`, `web/src/lib/canvas/` |
| Assistant | `web/src/components/agent/` |
| Platform connections | `web/src/components/connectors/`, `web/src/components/layout/` |
| Theme | `web/src/lib/app-theme.ts`; locate `canvasThemes` and `useThemeStore` for canvas tokens |
| Homepage intro | `web/public/cue-home-hero.html`; homepage integration under `web/src/pages/` |
| Provider adapter source | `canvas-connectors/src/` |
| Local Agent source | `canvas-agent/src/` |

The existing stack is React/Vite/TypeScript/Ant Design/Tailwind/Zustand. Development conventions are in `AGENTS.md`; provider and storage details can be discussed if needed for integration.

## Message draft for Alok

> Thanks for being open to this! I put together a short overview of my AI canvas project. Lovart is the overall direction I like, and my biggest struggle is making the interface feel consistent when different components come together. I would love to hear your thoughts. If a creation panel, generation-status card or chat component sounds interesting, perhaps we could pick a small piece to explore. I can handle integrating it into the project. Here is the overview: [English brief](brief.en.md).

This message is a draft for sharing with Alok.

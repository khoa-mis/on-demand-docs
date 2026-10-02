---
name: on-demand-docs
description: Generate or update an end-user guide for a Magnolia CMS component by driving the real Magnolia author instance in a browser, capturing annotated screenshots of every step, and writing a versioned web/PDF guide with a review page that shows what changed since the last approved version. Use when the user shares a ticket (e.g. an Asana task PDF) about a new or changed Magnolia component and asks for documentation, a user guide, how-to, or "docs for this ticket".
---

# On-Demand Documentation for Magnolia components

You turn a ticket about a Magnolia component into a reviewed, versioned, screenshot-illustrated guide
for content editors. Work through the five stages in order. Each stage writes a file the next one reads,
so you can re-run any stage on its own.

```
① Understand  ticket + component code      → runs/<slug>/<version>/brief.md, facts.json
② Locate      Magnolia pages using it      → facts.json (usages), sandbox page
③ Exercise    browser scenario             → scenario.json → steps.json + img/
④ Write       the guide                    → draft.md → draft.html
⑤ Review      diff vs approved, approval   → review.html → (on approval) docs repo commit
```

## Setup (automatic, every session)

`${CLAUDE_SKILL_DIR}` is the folder containing this SKILL.md; its `scripts/` folder holds the tools. All commands run
from the user's working folder, where `runs/` (drafts) and `docs/` (approved guides) are kept.

**Before anything else, run** `node ${CLAUDE_SKILL_DIR}/scripts/setup.mjs`. It installs whatever is missing
(npm packages, the Chromium browser for screenshots; about 2 minutes the first time) and checks the
Magnolia connection. Continue only when it prints `READY`. If it reports:

- **Node.js missing or too old**: you cannot fix this yourself. Ask the user to install the LTS version
  from https://nodejs.org (a normal installer, no terminal needed), then restart the app and try again.
- **git missing**: only needed for step ⑤ approval. On macOS, tell the user a system prompt will offer to
  install the developer tools the first time git runs; they should click **Install**.
- **Magnolia settings missing**: ask the user for the author instance URL, username and password, then
  write them to `.env` in the working folder (see `.env.example` next to this file). Never put credentials
  in any other file, never echo them back, and never commit `.env`.
- **Magnolia login fails**: show the HTTP status and ask the user to check the URL and account.

| Variable | Example |
|---|---|
| `MAGNOLIA_URL` | `https://your-magnolia-author.example.com` |
| `MAGNOLIA_USER` / `MAGNOLIA_PASSWORD` | an editor account allowed to create and edit pages |
| `ODD_DOCS_REPO` | folder holding approved guides (default `./docs`) |

## ① Understand

1. Read the ticket (PDF or pasted text). Extract: ticket id and title, the component, every
   user-visible change, acceptance criteria, and any wording guidance (e.g. "explain when to use each style").
2. Identify the component: its name as editors see it and, if available, its template id
   (`<module>:components/<name>`) and the light-module folder. Ask the user if the ticket doesn't say.
   The source code is optional; the skill works against Magnolia alone.
3. Decide the version: the next one after the latest entry in `<docs-repo>/components/<slug>/history.json`
   (or `v1` if there is no guide yet). `<slug>` is the component title in kebab-case.
4. Collect facts:
   - with the light module available: `node ${CLAUDE_SKILL_DIR}/scripts/component-facts.mjs <light-module-dir> <componentName> runs/<slug>/<version>/facts.json`
   - without source code: `node ${CLAUDE_SKILL_DIR}/scripts/component-facts.mjs - <templateId> runs/<slug>/<version>/facts.json`
     (usages only). Then add a `captureFields` op right after the component dialog opens in your scenario;
     `steps.json` will contain every field's label, type, options and required flag for the Field reference.
5. Write `runs/<slug>/<version>/brief.md`: the changes you will document, mapped to dialog fields, plus
   anything in the ticket that you cannot verify on screen.

## ② Locate

`facts.json → usages` lists real pages that use the component, for the **Where it's used** section.
Do **not** exercise the component on those pages. Scenarios always run on a hidden sandbox page that
`setup.page` creates and clears (see `references/scenario-reference.md`).

Choose the sandbox page's parent and template so the component can be added there: use the parent and
`mgnl:template` of a page listed in `usages` (fetch it with the REST nodes API, `includeMetadata=true`).
If nothing uses the component yet, ask the user which page template it is meant for. Name the sandbox
page `docs-sandbox`; it is hidden from navigation and never published.

## ③ Exercise

1. Write `runs/<slug>/<version>/scenario.json` following `references/scenario-reference.md`.
   For an update, copy the previous version's scenario and add steps for the new or changed fields.
   Keep existing step ids.
2. Run it: `node ${CLAUDE_SKILL_DIR}/scripts/run-scenario.mjs runs/<slug>/<version>/scenario.json runs/<slug>/<version>`
3. If a step fails, open its `img/NN-<id>-error.png`, fix the scenario and re-run. After three failed
   attempts on the same step, stop and tell the user what blocks you.
4. **Look at every screenshot** before writing. Check that the highlight sits on the right element and
   that the result really shows the change. Re-run if not.

## ④ Write

1. Write `runs/<slug>/<version>/draft.md` following `references/writing-guide.md`. For an update, start
   from `<docs-repo>/components/<slug>/doc.md` and change only what the ticket changed.
2. Copy the screenshots you reference so paths resolve: they already live in `runs/<slug>/<version>/img/`.
3. Render: `node ${CLAUDE_SKILL_DIR}/scripts/render-doc.mjs runs/<slug>/<version>/draft.md runs/<slug>/<version>/draft.html --draft`

## ⑤ Review and approve

1. Build the review page:
   `node ${CLAUDE_SKILL_DIR}/scripts/review.mjs runs/<slug>/<version> <docs-repo>/components/<slug> runs/<slug>/<version>/review`
   (use `-` instead of the docs path for a first version).
2. Show the user the review page (publish it if your platform can host pages; otherwise give the file path)
   and summarise in 3–5 bullets what changed and anything you could not verify.
3. Apply requested edits to `draft.md`, re-render, rebuild the review page.
4. **Only when the user explicitly approves**, run:
   `node ${CLAUDE_SKILL_DIR}/scripts/approve.mjs runs/<slug>/<version> <docs-repo> <slug> --by "<approver name>"`
   This copies the guide into the docs repo, renders `index.html` and `guide.pdf`, and commits and tags it.
   Report the commit and tag. Pushing to a remote happens only if the user asks.

## Rules

- Never modify real content pages. Only the sandbox page is edited.
- Never claim a behaviour that neither the screenshots nor the component code confirm.
- Never approve on the user's behalf.

# Writing guide: component guides

The reader is a **content editor** working in Magnolia's Pages app. They are not developers.
Write so someone who has never seen the component can use it correctly on the first try.

## Page structure (fixed order)

Every guide is one Markdown file with YAML front matter and these level-2 sections, in this order.
Keep the headings exactly as written so versions can be compared section by section.

```markdown
---
title: Tour Highlight Card
group: Travel components
templateId: mis-travel-components:components/tourHighlight
version: v2
date: 2026-10-02
ticket: { id: MIS-142, title: "Tour Highlight Card: add promotional badge", url: "" }
summary: One sentence describing what changed in this version (or what the component is, for v1).
magnolia: https://your-magnolia-author.example.com
---

## Overview
## Where it's used
## Add it to a page
## Configure it
## Field reference
## What's new in v2
## Changelog
```

| Section | What goes in it |
|---|---|
| **Overview** | 2–3 sentences: what the component is for and when to choose it over similar components. One screenshot of the finished component. |
| **Where it's used** | Table of pages from `facts.json → usages` (page path, last modified). Leave out the docs sandbox page. If no real page uses it yet, say so in one sentence. |
| **Add it to a page** | Numbered steps (`1.`), one action per step, each followed by its screenshot. |
| **Configure it** | One `###` subsection per task the editor might want (e.g. "Move the image to the right", "Show a badge"). Each: when to use it, numbered steps, before/after screenshots. |
| **Field reference** | Table built from `facts.json → fields`: Field, Type, Required, Default, What it does. Use the dialog's own labels. |
| **What's new in vN** | Only from v2 on. Bullet list of user-visible changes from the ticket, each linking to the subsection that explains it. Omit the section in v1. |
| **Changelog** | Newest first: `- **v2** (2026-10-02, MIS-142): one line`. Carry earlier entries forward unchanged. |

## Style

- Plain words. "Click **Save changes**", not "Persist the configuration".
- UI labels in **bold**, exactly as they appear on screen (check the screenshot).
- One action per numbered step. Start with a verb.
- Say *why* once, briefly, where it helps a decision ("Use **Sale** for discounted tours").
- Never invent behaviour. Every statement must be confirmed by a screenshot or by the component code (FTL, CSS, dialog YAML). If the ticket promises something neither confirms, leave it out and mention it in your hand-off notes.
- Mark content added in this version with `[NEW in v2]` after the heading or bullet. Do not mark unchanged content.
- Callouts: `> **Tip:** …`, `> **Important:** …`. Use at most one per section.

## Screenshots

- Reference images as `![Short caption](img/<file>.png)` on their own line, directly after the step they illustrate.
- Use the file names from `steps.json` exactly. Never reference an image whose step failed.
- Captions describe what the reader should notice ("The badge appears in the top-left corner of the image").

## Versioning rules

- When a previous approved guide exists, **start from it**. Keep unchanged sections word-for-word so the review diff only shows real changes.
- Bump `version`, `date`, `ticket`, `summary` in the front matter.
- Add the new `What's new` section and a Changelog line; update Field reference and any steps whose screenshots changed.

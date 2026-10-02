# On-Demand Docs for Magnolia

Turn a ticket about a Magnolia CMS component (for example an Asana task exported as PDF) into a
**screenshot-illustrated, versioned guide for content editors**. Claude opens your Magnolia author
instance in a real browser, uses the component the way an editor would, captures an annotated screenshot
of every step, writes the guide, and shows you a review page of what changed since the last approved
version. Nothing is published until you approve it.

```
Ticket PDF ──▶ ① understand ──▶ ② locate in Magnolia ──▶ ③ browser run + screenshots
                                                              │
        approved guide (web + PDF) ◀── ⑤ your approval ◀── ④ draft guide + review page
```

---

## Install (Claude Desktop, no terminal needed)

### Before you start (once)

| You need | How to get it |
|---|---|
| **Claude Desktop** with access to the **Code** tab (Pro, Max, Team or Enterprise plan) | https://claude.ai/download |
| **Node.js** (LTS version) | Download the installer from https://nodejs.org, double-click it, click through. Then quit and reopen Claude Desktop. |
| A **Magnolia author** account that can create and edit pages | Ask your Magnolia admin |

On a Mac, the first time an approval is saved, macOS may ask to install **developer tools**: click **Install**.
Everything else (browser for screenshots, libraries) is installed automatically on first use.

### Add the skill

1. Open **Claude Desktop** and switch to the **Code** tab.
2. Choose a folder for your documentation work, for example `Documents/Component guides`.
   Drafts and approved guides are saved there.
3. In the message box, type the following and press Enter:

   ```
   /plugin marketplace add khoa-mis/on-demand-docs
   ```

4. Then type and press Enter:

   ```
   /plugin install on-demand-docs@mis-studio
   ```

   (Alternatively click **+ → Plugins → Add plugin** and pick **on-demand-docs**.)
5. If Claude asks you to restart the session, do so.

### Use it

Drag the ticket PDF into the message box and write, for example:

> Create the editor guide for this ticket.

The first time, Claude sets itself up (about 2 minutes) and asks for your Magnolia address, username and
password. They are stored only in a `.env` file in your folder. Claude then shows you a link or file to the
**review page**. Reply with changes you want, or **"approve"** to save it as the official version.

### Update the skill

Type `/plugin marketplace update mis-studio`, then `/plugin install on-demand-docs@mis-studio` again.

---

## What it produces

In your working folder:

```
runs/<component>/<version>/       drafts: screenshots, scenario, draft guide, review bundle
docs/components/<component>/      approved guides (git history, one commit per approval)
  index.html  guide.pdf  doc.md  img/  history.json
```

Each guide follows a fixed structure: Overview · Where it's used · Add it to a page · Configure it ·
Field reference · What's new · Changelog.

## Limits of this version

- Tested with **Magnolia 6.2** (AdminCentral with Vaadin 8). Other versions need the UI driver adjusted.
- Runs only in the Claude Desktop **Code** tab (or Claude Code). The regular chat's uploaded skills run in a
  cloud sandbox that cannot open a browser against your Magnolia server, so this skill is not offered there.
- Scenarios run on a hidden `docs-sandbox` page; real content pages are never edited.

## For developers

```
plugins/on-demand-docs/skills/on-demand-docs/
  SKILL.md                      workflow Claude follows
  references/writing-guide.md   page structure and style rules
  references/scenario-reference.md  browser scenario format
  scripts/                      Node tools (Playwright driver, renderer, review diff, approval)
```

Scripts can be run by hand: `node scripts/setup.mjs` checks the environment; see the header comment of each
script for its arguments.

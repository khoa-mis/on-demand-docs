# Scenario reference

A scenario is a JSON file that drives Magnolia AdminCentral in a real browser and captures one
annotated screenshot per step. `scripts/run-scenario.mjs` executes it and writes `steps.json`.

```json
{
  "component": "Tour Highlight Card",
  "templateId": "mis-travel-components:components/tourHighlight",
  "setup": {
    "page": { "parent": "/travel", "name": "docs-sandbox", "template": "travel-demo:pages/standard",
              "title": "Docs sandbox", "clearArea": "main" }
  },
  "steps": [
    { "id": "fill-text", "title": "Enter title", "caption": "Type a Title.",
      "do":   [{ "op": "fill", "field": "Title", "value": "Vietnam: Hanoi to the Mekong" }],
      "shot": { "target": "dialog", "highlight": [{ "field": "Title" }] } }
  ]
}
```

- `setup.page` creates (or reuses) a hidden sandbox page and empties one area, so every run starts clean.
  Never point a scenario at a real content page.
- `id` becomes the screenshot file name (`img/05-fill-text.png`). Keep ids stable across versions so the
  review page can compare the same step before and after.
- `shot.when`: `"after"` (default) captures after the step's ops, `"before"` captures before them (use it
  to show what to click). Omit `shot` for steps that need no picture.

## Operations (`do`)

| op | arguments | what it does |
|---|---|---|
| `login` | | Log in to AdminCentral with the configured user. Always the first op. |
| `openEditor` | `path` | Open a page in the Pages app editor. |
| `openAddDialog` | `placeholder` | Click an empty area placeholder (e.g. "New Main Component") to open **Add component**. |
| `openSelect` / `pickOption` | `field` / `option` | Open a drop-down, then pick an option (two steps so the open list can be photographed). |
| `select` | `field`, `option` | Open a drop-down and pick in one go. |
| `button` | `label` | Click a dialog button (Next, Choose, Cancel, Save changes). Case-insensitive. |
| `fill` | `field`, `value` | Type into a text field or text area. |
| `radio` | `field`, `option` | Choose a radio option by its label. |
| `checkbox` | `field`, `value` (true/false) | Tick or untick a checkbox. |
| `openChooser` / `pickInTree` | `field` / `path` (array) | Click **Select new** next to an asset/page field, then walk the tree, e.g. `["tours", "vietnam.jpg"]`. Follow with `button: Choose`. |
| `save` | | Click **Save changes** and wait for the page to re-render. |
| `selectComponent` | `selector`, `nth` | Click a rendered component on the page (CSS selector of its markup) to select it. |
| `editComponent` | `title`, `nth` | Open a component's edit dialog via the pencil on its green editor bar (`title` = the bar label, e.g. "Tour Highlight Card"). Prefer this over `action: Edit component`. |
| `action` | `label` | Click an action in the right-hand action bar. |
| `scrollTo` | `target` (reference) | Scroll something into view. |
| `captureFields` | | Record the open dialog's fields (label, type, required, options, current value) into `steps.json`. Use it once, right after the component dialog first opens, when the source code isn't available. |
| `wait` | `ms` | Last resort. |

## References (for `highlight`, `target`, `scrollTo`)

| reference | points at |
|---|---|
| `{ "field": "Title" }` | The input area of a dialog field, by its label. |
| `{ "button": "Save changes" }` | A dialog button. |
| `{ "action": "Edit component" }` | An action-bar entry. |
| `{ "placeholder": "New Main Component" }` | An empty-area placeholder in the page. |
| `{ "component": ".tour-highlight", "nth": 0 }` | Rendered component markup in the page. |
| `{ "option": "Tour Highlight Card" }` | An entry in an open drop-down. |
| `{ "tree": "destination" }` | A row in an open chooser tree. |
| `{ "text": "…" }` | Any visible text (last resort). |

Add `"label": 1` to a highlight to print a numbered marker; with several highlights they are numbered
automatically. Match the numbers to the order of actions in the caption.

## Shot targets

`viewport` (whole screen), `dialog` (the open dialog, cropped), `editor` (the page preview area),
`actionbar`, or any reference (crops to that element).

## Writing a good scenario

1. Read the dialog YAML (or `facts.json`) and the ticket. List the tasks an editor needs to do.
2. Add the component once with realistic content (real-sounding tour names, pick existing images).
3. For each new or changed field: open the dialog, change only that field, save, and capture the result
   on the page with `target: "editor"` and a highlight on the component.
4. Keep the same step ids as the previous version's scenario for unchanged steps.
5. If a step fails, read the `-error.png` screenshot, fix the reference or add a step, and re-run.

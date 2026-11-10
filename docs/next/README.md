# quoin vNext — plan pack

Planning documents for `datakid/power-query-manager` (branch `beta`). These files are a brief for the model doing the build. They are not app code. Hand the `plan/` folder over as-is.

## Reading order

`00` → `02` → `02A` → `02B` → `03` → `04` → `05` → `06`. Where two files disagree, the later letter wins for its own subject: `02B` over `02A` over `02` for shape and size, `02A` over `02` for colour. Behaviour always comes from `03`, `04` and `06`.

## Files

| File | Status | What it covers |
|---|---|---|
| `plan/00_overview_upload.md` | updated | summary note (marked historical) plus `00_START_HERE`: guardrails, phases, definition of done. Reading table and Phase 2 now include 02A and 02B |
| `plan/02_IDENTITY.md` | banner updated | name, mark geometry, component list, verification |
| `plan/02A_IDENTITY_AMENDMENT.md` | updated | the *Glaze* palette, **colour values unchanged**. Radii, row heights, pane headers and density now point to 02B. Dark-ring fix noted; `pairs.json` gains the 02B pairs |
| `plan/02B_VISUAL_REFINEMENT.md` | **new** | calm, rounded, minimal: shape and size tokens, hierarchy rules, one filled button per layer, disclosure tiers T1–T4, refined components, mobile, the **control inventory (no-loss contract)**, tests T-V-01…07 and T-I-09, and small fixes (reserved shortcuts, dark favicon ring, navigator ARIA) |
| `plan/03_EDIT_RUN_SAVE.md` | updated | E-1 … E-12; old palette names translated; Changes/Download placement; shortcut safety |
| `plan/04_PRINT.md` | updated | P-1 … P-14; named `@page` rules (a class cannot select `@page`); Tabloid/Executive sizes; calmer print panel that still shows every setting |
| `plan/05_TEST_PLAN.md` | updated | adds T-I-08, T-I-09, T-LINT-17, T-V-02…07; extra rows in the manual browser matrix |
| `plan/06_WORKBENCH.md` | updated | WB-1 … WB-28 unchanged in scope; sizes from 02B; safe shortcuts (`Ctrl/Cmd+Shift+1/2`, `Ctrl/Cmd+Alt+F`); ARIA tree fix; I-V step; handover prompt now names 02B |
| `plan/assets-v2/refined-preview.html` (+ `-dark`) | **new** | **the visual target**: workbench at 1280 px, components, overlays, empty state, phone, control inventory excerpt |
| `plan/assets-v2/glaze-preview.html` (+ `-dark`) | kept | the original Glaze preview with live contrast ratios |
| `plan/assets-v2/mark.svg`, `favicon.svg`, `icon-maskable.svg` | **new** | Glaze marks with the dark-scheme ring fixed (light ring on dark grounds) |
| `plan/assets-v2/ref/` | **new** | the three uploaded mark renders, kept as evidence for the dark-ring fix |

`01_AUDIT.md` and the original `plan/assets/` were not uploaded, so they are not in this repo. They still live in the source repo.

## What changed versus the previous pack, in one breath

The colours, features, phases and test IDs are unchanged. What changed is the look and the hierarchy. Panes are now rounded and float on the ground with an 8 px channel between them. Labels are sentence case, and the radii and row heights are larger. Comfortable density is the default. Each layer has one filled button. Secondary actions show on the focused object and in menus, and every command is also in the palette. A table and a test (T-V-07) guarantee that no control was dropped. A few browser-reserved shortcuts and an invalid ARIA nesting were also corrected.

## Remaining

- The owner confirms D-1 … D-4 in `06` §2.3. The defaults apply until then.
- Copy `plan/` into the source repo (it replaces `02A`, `06`, `assets-v2/` and adds `02B`).

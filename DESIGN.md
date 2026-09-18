# NookGrid design standard

Use Adam Wathan and Steve Schoger's **Refactoring UI** as the design reference for every NookGrid interface, page and visual asset. Apply its principles to this compact puzzle game rather than copying the book's sample screens. The supplied book stays private; this file contains our own practical interpretation.

## Brand mark

Use the approved **One Move** mark: three cream tiles and one tilted gold tile on forest green. `public/favicon.svg` is the vector source. Preserve its geometry and colors; the Trebuchet NookGrid wordmark remains unchanged. Browser favicons use the rounded background. The 180px Apple touch icon and 1024px iOS AppIcon derive from the same artwork with a full opaque forest background, allowing the platform to apply its corner mask. Keep all four page icon links on the same cache version when replacing the mark. Do not replace the illustrated game pieces with the brand mark.

## Hierarchy before decoration

The board and neighborhood plan are the main task. Puzzle number, date, coordinates, help and countdown support that task. Reduce competing weight and contrast before making important content larger. Use correct semantic headings without letting their HTML level dictate visual size. Reference: pages 36–47 and 54–62.

| Surface | Primary action | Quieter actions |
| --- | --- | --- |
| Daily completion | Share result | Reset and Feedback as peers |
| Tutorial completion | Play today's puzzle | Reset and Feedback as peers |
| Archived completion | Share result | Today's puzzle, Reset and Feedback |
| Hint confirmation | Reveal | Cancel |
| Feedback | Send | Close |
| Share fallback | Select/copy the existing result | Close |
| Load failure | Try again | Normal header navigation |

Choose emphasis from the player's task, not from a mandatory primary/secondary/tertiary template. One solid primary action can sit alongside several equally quiet controls. Reset and Feedback are peer utilities: use matching borderless styling, target sizes, hover and focus treatment. An outline or secondary surface is useful only when an action genuinely needs intermediate emphasis. A state-changing action does not automatically need a red, heavy button. Avoid redundant actions and keep labels concise.

Keep the outcome, main action and supporting countdown together on the completion surface, with the utility row beneath it. Share stays above the countdown; the countdown is smaller and lighter than the outcome. The menu has two matching rows, Puzzles and Settings, followed by a separate Feedback and Privacy footer. Puzzles contains Tutorial, Today and past dates in one list. Show thirty dates initially, then Earlier puzzles; exclude unreleased dates and mark the current route. Do not duplicate Today in another archive control. Every dated puzzle uses the date as its primary label, with Today as quiet secondary text. Keep a chevron on every row and mark the current route with a small dot and Current label beside it. Do not use completion checkmarks or green row fills to indicate selection.

## Spacing and proportions

- Put related text closer together than separate groups. Result title, time and hint count form one group; actions form another. Reference: pages 96–99.
- Fit panels to real content. Preserve the compact board and bounded plan width instead of stretching them into unused space. Reference: pages 76–82.
- Prefer existing spacing choices: 4, 8, 12, 16, 24 and 32px. Existing board geometry and 44px interaction targets are functional exceptions, not a reason to scale everything uniformly.
- Preserve the established desktop 400px board, 192px tray/result panel and 248px plan unless a real layout problem calls for a change.
- Desktop and regular laptop game states should fit without page scrolling. Native portrait phone gameplay must fit within the usable screen height, including completion and selected-piece states. Browser phones use the vertical layout below; enlarged text, error notices and landscape must remain accessible rather than being clipped.
- Adapt widths, type and panel order independently on mobile. Long labels may wrap; controls must not collide. Reference: pages 92–95.

## Typography, color and surfaces

- Use the system font for all interface text and headings. Reserve Trebuchet for the NookGrid wordmark. Dialog and reading-page titles are 20px/700, below the 24px phone wordmark. Use 14px body and action text, 13px supporting descriptions and 12px captions. Compact gameplay geometry has its own readable type sizes below.
- Reuse the forest accent, dark ink and green-tinted neutrals. Avoid unrelated palettes in different dialogs. Reserve warning treatment for an actual warning, such as unavailable local saving.
- Small text must remain readable. Aim for at least 4.5:1 contrast for ordinary text, including actionable placed-piece labels and board coordinates. Keep status icons/text alongside colors.
- Use spacing or a subtle surface before adding borders and shadows. Borders may still identify controls; shadows should indicate layers or movement. Reference: pages 142–168, 180–184 and 238–241.
- Touch and mouse interaction must not show keyboard focus rings, including automatic dialog focus and focus restoration. Keep focus in place for accessibility; restore visible outlines on keyboard navigation. Typing in a touch-opened text field stays visually quiet. Selected pieces and Tutorial destinations retain their purposeful outlines.
- Every action needs visible keyboard focus. Preserve accessible names, minimum 44px standalone touch targets, native controls, reduced-motion behavior and Escape/backdrop dialog dismissal.

## Dialogs and reading pages

The menu has an accessible name without a visible title. Use one left-aligned heading style for Puzzles, Settings, Feedback, Share and Tutorial tips; the short Hint confirmation stays centered. Primary actions use forest green, secondary actions use the quiet neutral surface, and close controls retain the same 44px target. Reading pages can scroll and use a visible Back to puzzle action. Their page title must not overpower the NookGrid wordmark. Back to puzzle returns to the actual Tutorial or archived puzzle the player left. The question-mark control opens the Tutorial. Within the Tutorial it opens an inline tips reference beneath the game, with Back to tutorial returning to the board. The worked example remains optional reading. Do not add a separate How to Play dialog.

Menu rows are 48px tall with a shared soft background, a quiet separator and a trailing Phosphor chevron. The unified Puzzles list scrolls within its dialog, leaving the heading and close control visible. Feedback and Privacy use quieter underlined links with 44px targets. Settings uses a labeled 44px-tall analytics switch with its explanation and live status in one group, plus a plain saved-progress note. Privacy remains a separate menu destination. Email links say Email us instead of displaying an address. Static explanations do not need their own card or heading. Changes apply immediately; do not add a redundant Save button. Keep disabled, blocked and failed-save states clear.

## Every state is part of the design

Check loading, empty, selected, dragging, disabled, hint-locked, completed, unavailable, error and success states. Show useful feedback and recovery instead of inactive controls that look usable. Keep entered feedback on failed sends. A failed progress save offers Retry save and clears only after a successful write. An unavailable archive says so instead of displaying an endless loading state. Fixed places use the same lock mark in the tray and on the board; movable placed pieces use a check. Use selectable output styling for a read-only share result. Reference: pages 234–236, applied to this game's states.

The Tutorial must stay optional and easy to find. Its short introduction explains the mode, and its first move names both the tap action and destination A1. Keep that instruction visible in native portrait. A visual outline supplements the named destination. Teach the next-square relationship during the second move, plan statuses when the full plan appears, and move/swap/remove when a placed piece is selected. Extra controls and spatial terms are available in Tutorial tips without interrupting play. Do not add a new onboarding overlay to solve a spacing problem.

## Before shipping any design change

1. Identify the player's immediate task and the intended action hierarchy.
2. Read the existing component and its sibling states before editing it. Reuse the shared styles.
3. Inspect actual content at desktop, laptop, phone and narrow-phone sizes, including long text and solved states.
4. Check keyboard focus, labels, relevant color contrast and touch targets. For dialogs, test Escape, outside dismissal and focus restoration.
5. Verify affected behavior with isolated `?test=1` previews and blocked external telemetry. Do not count QA as growth.
6. Record findings, fixes and deliberate exceptions. Review the actual rendered result before publishing. Passing geometry and contrast checks does not by itself establish coherent grouping or visual hierarchy.

Refactoring UI provides design principles, not a conformance certificate. Name the specific issue and the player benefit rather than claiming universal compliance.

## iOS surfaces

The native app keeps the shared compact game. CSS owns top and bottom safe-area padding so the title and controls never overlap the status bar or home indicator; a fixed background keeps scrolled content clear of the status bar. Dialog height also respects those insets. Use the existing game icon and a quiet light launch surface. The optional website App Store suggestion is a small dismissible row, shown only on Apple touch devices after a real listing ID is configured. It must never cover or block the puzzle.

## Phone layout

Stack the neighborhood plan, board, place tray and action row in that order. The dimensions in this paragraph describe the mobile website; the native portrait adjustments follow. Balance the visible space above and below the plan list: the phone plan panel has 8px bottom padding so the final rule has about the same breathing room before the board as the heading has before the first rule. Center the board at up to 300px wide. Let the tray and action row span up to 360px independently, with two centered rows of five and four places. Place illustrations are 52 by 44px within tiles at least 72px tall, with 11px labels. Do not shrink the place tray to the board width. Keep 12px between the play sections; remove idle selection text from layout while preserving screen-reader announcements. Undo, Reset and Hint remain equal-width peers beneath the items, with 12px gaps, 48px touch targets and 6px between each icon and label. Completion replaces the tray beneath the solved board. The DOM order follows the mobile reading order. Desktop keeps its established columns.

## Interface icons

Use the shared, locally bundled Phosphor regular icons in `public/icons.svg` on web and iOS. Keep interface icons at 20px, header icons at 24px and status/lock marks at 12–14px. Preserve accessible text and hide decorative SVGs from assistive technology. Native input affordances and the illustrated game pieces retain their own artwork. Include the Phosphor license in every distributed bundle; do not load an icon font or CDN at runtime.

## Native portrait fit

Use the screen height after the status-bar and home-indicator insets. Keep every plan statement, all nine places and Undo/Reset/Hint visible together. A compact 24px brand and puzzle metadata identify the puzzle; the repeated daily objective stays in Tutorial tips while Tutorial instructions remain visible. The board uses the remaining height, up to 300px wide, with every lot at least 44px. Do not scale the whole screen or hide overflow to force a pass.

Use 6–8px section gaps and a 60px place tile, reduced to 54px with no extra gap between padded plan rows on short phones. Art remains separate from the smaller Phosphor status marks. Put back joins the bottom controls when a placed piece is selected, while selection announcements remain available to screen readers. Completion uses two compact columns with Share above the countdown and matching Reset/Feedback utilities below. Preserve scrollable dialogs and readable recovery messages.

Verify seven- and ten-statement plans, selection, hints, daily/archive completion and every Tutorial stage at 393×852, 402×874 and 375×667, including safe-area insets. Browser checks must assert actual content bounds and 44px targets; simulator checks must also verify that a swipe does not move the main page.

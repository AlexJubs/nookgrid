# NookGrid design standard

Use Adam Wathan and Steve Schoger's **Refactoring UI** as the design reference for every NookGrid interface, page and visual asset. Apply its principles to this compact puzzle game rather than copying the book's sample screens. The supplied book stays private; this file contains our own practical interpretation.

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

Keep the outcome, main action and supporting countdown together on the completion surface, with the utility row beneath it. Share stays above the countdown; the countdown is smaller and lighter than the outcome. In the menu, group Today's puzzle, Tutorial and Archive together, then separate the quieter help/settings links. A navigation menu needs a clear reading order, not a promotional headline or a filled button.

## Spacing and proportions

- Put related text closer together than separate groups. Result title, time and hint count form one group; actions form another. Reference: pages 96–99.
- Fit panels to real content. Preserve the compact board and bounded plan width instead of stretching them into unused space. Reference: pages 76–82.
- Prefer existing spacing choices: 4, 8, 12, 16, 24 and 32px. Existing board geometry and 44px interaction targets are functional exceptions, not a reason to scale everything uniformly.
- Preserve the established desktop 400px board, 192px tray/result panel and 248px plan unless a real layout problem calls for a change.
- Desktop and regular laptop game states should fit without page scrolling. Phones use the vertical layout below; short screens and solved states may scroll instead of shrinking pieces or hiding content.
- Adapt widths, type and panel order independently on mobile. Long labels may wrap; controls must not collide. Reference: pages 92–95.

## Typography, color and surfaces

- Reuse the current system body font and heading family. Use weight and contrast for hierarchy before introducing another font or size. Keep supporting copy quieter without making it unreadable.
- Reuse the forest accent, dark ink and green-tinted neutrals. Avoid unrelated palettes in different dialogs. Reserve warning treatment for an actual warning, such as unavailable local saving.
- Small text must remain readable. Aim for at least 4.5:1 contrast for ordinary text, including actionable placed-piece labels and board coordinates. Keep status icons/text alongside colors.
- Use spacing or a subtle surface before adding borders and shadows. Borders may still identify controls; shadows should indicate layers or movement. Reference: pages 142–168, 180–184 and 238–241.
- Every action needs visible keyboard focus. Preserve accessible names, minimum 44px standalone touch targets, native controls, reduced-motion behavior and Escape/backdrop dialog dismissal.

## Every state is part of the design

Check loading, empty, selected, dragging, disabled, hint-locked, completed, unavailable, error and success states. Show useful feedback and recovery instead of inactive controls that look usable. Keep entered feedback on failed sends. Use selectable output styling for a read-only share result. Reference: pages 234–236, applied to this game's states.

The Tutorial must stay optional and easy to find. Its short introduction explains the mode, the next-step instruction names the move, and the selection row explains the control. Do not add a new onboarding overlay to solve a spacing problem.

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

Stack the neighborhood plan, board, place tray and action row in that order. Center the board at up to 300px wide and match the tray and controls to it. The tray uses two centered rows of five and four places. Keep 12px between the play sections; remove idle selection text from layout while preserving screen-reader announcements. Undo, Reset and Hint remain equal-width peers beneath the items. Completion replaces the tray beneath the solved board. The DOM order follows the mobile reading order. Desktop keeps its established columns.

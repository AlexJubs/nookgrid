# NookGrid design standard

Use Adam Wathan and Steve Schoger's **Refactoring UI** as the design reference for every NookGrid interface, page and visual asset. Apply its principles to this compact puzzle game rather than copying the book's sample screens. The supplied book stays private; this file contains our own practical interpretation.

## Brand mark

Use the approved **One Move** mark: three cream tiles and one tilted gold tile on forest green. `public/favicon.svg` is the vector source. Preserve its geometry and colors; the Trebuchet NookGrid wordmark remains unchanged. Browser favicons use the rounded background. The 180px Apple touch icon and 1024px iOS AppIcon derive from the same artwork with a full opaque forest background, allowing the platform to apply its corner mask. Keep all four page icon links on the same cache version when replacing the mark. Do not replace the illustrated game pieces with the brand mark.

## Hierarchy before decoration

Use the shared Grove palette, system typography and quiet controls on web and iPhone. The home screen makes the daily streak prominent, with a seven-day strip and one Play or Continue action. New and completed days start at home; an unfinished daily attempt resumes directly. Explicit dated links and Tutorial links go straight to their puzzle. Tutorial starts fresh on entry or reload, without saved level progress. Help, View solved puzzle and backgrounding preserve the current attempt and screen.

Calendar is the only puzzle-history destination. Use a surfaced button with the local calendar icon and All puzzles label on home and result, with the same destination in the menu. It opens one month at a time, with Previous month and Next month buttons bounded by the launch and current months. Open the viewed archive’s month, or the current month from home and Tutorial. Preserve the displayed month and keyboard focus when saved history or the UTC puzzle date changes. Announce the month heading politely. Underline the current puzzle and explain that mark in the existing legend. Completed saves receive checks; dates that earned daily streak credit are highlighted separately. Archive play does not earn daily streak credit. Future, prelaunch and missing puzzles cannot be opened. Calendar days, controls and available week dates keep 44px targets. On Home and completion, tapping a week date or completed check opens that puzzle with its saved progress. Future, prelaunch and missing dates stay unavailable. Preserve week-link keyboard focus when history updates; at week rollover, focus the new current date if the old date is no longer visible.

Gameplay has one weekday-and-date heading for daily and archive puzzles, such as Fri, Sep 18, 2026. Guided practice uses Tutorial plan. Use 14px plan text at 1.5 line height, 6px between rows and semibold place names. Preserve the full relational wording and order. Pending marks stay visually hidden in a reserved status gutter; matching/conflict shapes and accessible descriptions remain. No repeated date/title stack, plan cards, tray bubbles or Put back control. Dragging a movable place back to the tray removes it; Delete or Backspace removes a selected place by keyboard, and Undo restores it. Preserve visible keyboard focus when Tutorial guidance hides a removed tray place. Fixed hints stay locked. Moving, swapping, Undo, Reset and Hint remain.

Completion has its own result screen with a borderless 141px neighborhood illustration, result, earned streak, time/hints, Share and next-puzzle timing. View solved puzzle shows the full read-only board with a Plan complete disclosure and a Back to results action. Hide Undo, Reset and Hint; taps, drags and keyboard input cannot alter the completed arrangement. Keep the UTC-midnight schedule and saved history through replay.

The board and neighborhood plan are the main task. Puzzle number, date, coordinates, help and countdown support that task. Reduce competing weight and contrast before making important content larger. Use correct semantic headings without letting their HTML level dictate visual size. Reference: pages 36–47 and 54–62.

| Surface | Primary action | Quieter actions |
| --- | --- | --- |
| Daily completion | Share result | View solved puzzle, All puzzles |
| Tutorial completion | Play today's puzzle | View solved puzzle, All puzzles |
| Archived completion | Share result | View solved puzzle, All puzzles |
| Hint confirmation | Reveal | Cancel |
| Feedback | Send | Close |
| Share fallback | Select/copy the existing result | Close |
| Load failure | Try again | Normal header navigation |

Choose emphasis from the player's task, not from a mandatory primary/secondary/tertiary template. One solid primary action can sit alongside several equally quiet controls. An outline or secondary surface is useful only when an action genuinely needs intermediate emphasis. A state-changing action does not automatically need a red, heavy button. Avoid redundant actions and keep labels concise.

Keep the outcome, streak, week strip and supporting countdown together above one group of three full-width actions: Share result, View solved puzzle and All puzzles. Tutorial substitutes Play today's puzzle for Share result. Pair these completion labels with matching 20px Phosphor regular icons: Share, Eye, Calendar and Play for the Tutorial action. Use matching secondary buttons for the two navigation actions. Undo, Reset and Hint are only for unfinished puzzles. Feedback stays in Menu and Home in the header; do not duplicate them on the recap. Anchor the action group near the bottom of the available safe viewport, with natural scrolling on short or enlarged-text screens. Make the countdown easy to read with 40px medium-weight tabular digits and a quiet Next puzzle in label above it. The menu uses four matching flat rows: All puzzles, Settings, Feedback and Privacy. All puzzles opens the existing calendar; there is no separate puzzle list. Dates open the selected puzzle directly and preserve current, completed and earned-streak descriptions. Play tutorial sits at the bottom of Home as a quiet text button, below the dated puzzle actions, and remains available in How to play. Each entry starts fresh practice. Reuse saved completion history for dated puzzles so Reset and replay retain completion; Tutorial completion lasts only for the current visit.

## Spacing and proportions

- Put related text closer together than separate groups. Result title and metadata form one group; actions form another. Streak, solve time and concise hint counts share one wrapping row with the same regular 16px text and primary ink color. Separate metrics with 12px spacing, without punctuation that could start a wrapped line; use No hints, 1 hint or the hint count. Leave 24px extra space before the result's week strip, moving it and the countdown closer to the anchored actions. Reference: pages 96–99.
- Fit panels to real content. Preserve the compact board and bounded plan width instead of stretching them into unused space. Reference: pages 76–82.
- Prefer existing spacing choices: 4, 8, 12, 16, 24 and 32px. Existing board geometry and 44px interaction targets are functional exceptions, not a reason to scale everything uniformly.
- Phone home uses the available safe viewport height: title and date above, streak and week in the middle, Play/Continue and Calendar near the bottom. Expand space between those groups, not inside labels. Short or larger-text homes scroll naturally without clipping.
- Desktop can place the tray, board and plan beside each other; home and result remain comfortably narrow. Phone gameplay stacks the plan, board, tray and actions.
- Regular native portrait gameplay should fit within the usable screen height. Short phones, long plans, enlarged text and result/history/help screens may scroll when readable text and 44px targets require it. Never clip content or scale the whole screen to force a pass.
- Adapt widths, type and panel order independently on mobile. Long labels may wrap; controls must not collide. Reference: pages 92–95.

## Typography, color and surfaces

- Use the system font for all interface text and headings. Reserve Trebuchet for the NookGrid wordmark. Dialog and reading-page titles are 20px/700, below the 24px phone wordmark. Use 14px body and action text, 13px supporting descriptions and 12px captions. Compact gameplay geometry has its own readable type sizes below.
- Reuse the forest accent, dark ink and green-tinted neutrals. Avoid unrelated palettes in different dialogs. Reserve warning treatment for an actual warning, such as unavailable local saving.
- Small text must remain readable. Aim for at least 4.5:1 contrast for ordinary text, including actionable placed-piece labels and board coordinates. Keep status icons/text alongside colors.
- Use spacing or a subtle surface before adding borders and shadows. Borders may still identify controls; shadows should indicate layers or movement. Reference: pages 142–168, 180–184 and 238–241.
- Touch and mouse interaction must not show keyboard focus rings, including automatic dialog focus and focus restoration. Keep focus in place for accessibility; restore visible outlines on keyboard navigation. Typing in a touch-opened text field stays visually quiet. Selected pieces and Tutorial destinations retain their purposeful outlines.
- Every action needs visible keyboard focus. Preserve accessible names, minimum 44px standalone touch targets, native controls, reduced-motion behavior and Escape/backdrop dialog dismissal.

## Buttons and action labels

Holding a button or button-style link must not select its label. Keep reading content and text fields selectable.

Use regular 400 weight for action labels, including primary, secondary, quiet text, menu rows, Settings and disclosures. Primary emphasis comes from the forest fill, not bolder type. General actions use 14px text with 1.4 line height; menu rows retain 1.5. Keep the compact 12–13px gameplay toolbar and the separate place/date typography needed for puzzle content and earned-state markers.

Reuse `.primary`, `.secondary` and `.text-button`; button-style links, including Play tutorial and Back, use the same classes. Filled primary and neutral secondary controls use 14px corners and at least 48px height. Quiet and icon controls use 8px corners and at least 44px targets. Home actions retain 52px height; menu rows retain their flat dividers and 48px height. Board, tray, toolbar and calendar geometry remain deliberate compact exceptions.

Use the shared palette for resting and hover states. Disabled and locked controls do not acquire an enabled hover treatment. Earned calendar dates retain contrasting accent text and fill when hovered. All controls use the shared focus color for keyboard input and stay quiet after touch. Check primary, secondary, quiet, icon, selected, locked, disabled and disclosure states in both themes.

Keep selection outlines within the board gap. Raise keyboard-focused cells above their neighbors and drag targets above focus, so each outline remains visible on every side.

## Dialogs and reading pages

Use the same left-aligned heading and upper-right close control for Menu, All puzzles, Settings, Feedback, Share and How to play; the short Hint confirmation stays centered. Primary actions use forest green, secondary actions use the quiet neutral surface, and close controls retain the same 44px target. Reading pages can scroll. Privacy uses a concise Back action. Their page title must not overpower the NookGrid wordmark. Return actions preserve the actual Tutorial or archived puzzle the player left. The question-mark control opens one How to play dialog over the current puzzle on every route. Keep the board, selection and scroll position intact; close with X, Escape or an outside tap and restore focus to the question mark. Keep the instructions readable with internal scrolling on smaller screens or enlarged text. Play tutorial is a separate, optional neutral button-style link for guided practice; hide it when already in the Tutorial. Keep How to play in the dialog and omit the redundant worked-example route.

Menu rows have matching 48px minimum targets, regular-weight left-aligned labels and trailing chevrons. Use the same padding and divider placement for every row, without a separate footer or surrounding cards. Calendar shows a single complete month with no internal month list or scroller. All six calendar rows and 44px controls fit a small portrait phone; the dialog may scroll only when enlarged text or an unusually short viewport requires it. Settings uses a labeled 44px-tall analytics switch with its explanation and live status in one group, plus a plain saved-progress note. Privacy remains a separate menu destination. Email links say Email us instead of displaying an address. Static explanations do not need their own card or heading. Changes apply immediately; do not add a redundant Save button. Keep disabled, blocked and failed-save states clear.

## Every state is part of the design

Check loading, empty, selected, dragging, disabled, hint-locked, completed, unavailable, error and success states. Show useful feedback and recovery instead of inactive controls that look usable. Keep entered feedback on failed sends. A failed progress save offers Retry save and clears only after a successful write. An unavailable archive says so instead of displaying an endless loading state. Fixed places use the same lock mark in the tray and on the board; movable placed pieces use a check. Use selectable output styling for a read-only share result. Reference: pages 234–236, applied to this game's states.

The Tutorial stays optional and easy to find through a neutral surfaced link. Keep the Tutorial header label, clues and place names, but remove explanatory copy, the introduction and Learn by playing subtitle. Progressive pieces, relevant clues and the first destination outline teach the interaction visually. Preserve step instructions in the screen-reader live region. Extra controls and spatial terms remain in How to play without leaving the puzzle. Do not add another onboarding overlay.

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

Stack the neighborhood plan, board, place tray and action row in that order. The dimensions in this paragraph describe the mobile website; the native portrait adjustments follow. Balance the visible space above and below the plan list: the phone plan panel has 8px bottom padding so the final rule has about the same breathing room before the board as the heading has before the first rule. Center the board at up to 300px wide. Let the tray and action row span up to 360px independently, with two centered rows of five and four places. Place illustrations are 52 by 44px within tiles at least 72px tall, with 11px labels. Do not shrink the place tray to the board width. Keep 12px between the play sections; remove idle selection text from layout while preserving screen-reader announcements. Undo, Reset and Hint remain equal-width peers beneath the items, with 12px gaps, 48px touch targets and 6px between each icon and label. Keep the visible action label Hint; its accessible name reports hints used, and completion retains the hint total. Completion opens its own result screen; View solved puzzle returns to the board. The DOM order follows the mobile reading order. Desktop keeps its established columns.

## Interface icons

Use the shared, locally bundled Phosphor regular icons in `public/icons.svg` on web and iOS. Plan states use minus for pending, check-square for a matching relationship and x-square for a conflict, with consistent sizing and no colored circular backgrounds. Keep accessible state descriptions alongside the distinct shapes. Keep interface icons at 20px, header icons at 24px and status/lock marks at 12–14px. Preserve accessible text and hide decorative SVGs from assistive technology. Native input affordances and the illustrated game pieces retain their own artwork. Include the Phosphor license in every distributed bundle; do not load an icon font or CDN at runtime.

## Native portrait fit

Use the screen height after the status-bar and home-indicator insets. On regular portrait screens, keep every plan statement, all nine places and Undo/Reset/Hint visible together. Short screens and longer plans may scroll to preserve readable text and 44px targets. A compact 24px brand and one plan heading identify the puzzle; the repeated daily objective stays in How to play while Tutorial instructions remain available to screen readers without adding visible prose. The board uses the remaining height, up to 300px wide, with every lot at least 44px. Do not scale the whole screen or hide overflow to force a pass.

Use compact section gaps and place tiles of at least 44px. Art remains separate from the smaller Phosphor status marks. Selection announcements remain available to screen readers. Completion uses its own result screen with one three-action group below the countdown. The solved board hides all three gameplay controls, including when all nine places are fixed by hints. Preserve scrollable dialogs and readable recovery messages.

Verify seven- and ten-statement plans, selection, hints, daily/archive completion and every Tutorial stage at 393×852, 402×874 and 375×667, including safe-area insets. Assert 44px targets, no horizontal overflow and access to all content. Regular portrait gameplay should fit; verify vertical scrolling when a short or enlarged layout needs it.

## Public download entry

Public game and shared-result links lead to the App Store. The fallback uses the existing palette and primary button, one short brain-game description, and quiet How to play, Support and Privacy links. It contains no active gameplay. Native startup waits for its bridge before showing the existing home screen. Keep native gameplay and loopback QA available; never use a public test query as a bypass.

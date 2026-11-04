# Design rules

How a screen is checked. Read by `design` before it prototypes and by `design-check` on every frame and build.

These rules decide execution, never the look. The direction and `DESIGN.md` decide the look. A rule that seems to ask for a colour, a typeface or a style is misread. It asks only that whatever was chosen is used with intent.

## How to use this

- Check from a screenshot. Every check below can be passed or failed by looking at a rendered screen at its real size. When a check needs a state you cannot see (focus, error, empty), it needs that state's frame, and a missing frame fails rule 8.
- Go in order: **Idea** first, then every **hard** check, then **soft**.
- **Hard** is the floor: structure, contrast, targets, focus and states. A hard failure blocks the screen. `DESIGN.md` cannot waive it.
- **Soft** is a default. `DESIGN.md` may override a soft check on purpose, with a written reason. A soft finding with no reason in `DESIGN.md` is reported, not blocked.
- A finding is four things: the rule (number and check), hard or soft, where on the screen, and the fix.
- The shared core applies to everything. Then add the site list or the app list, whichever the brief's surface says.

## 0. Idea

**Principle:** the screen says one thing about this product that a screen from another product would not.

- [soft] Cover the logo and the name. Is it still recognisably this product, from its content, imagery, voice or structure? A screen that could belong to any product in the category fails.
- [soft] You can say what the screen is for in one sentence, and the most visible element serves that sentence.
- [soft] The ownable idea in `DESIGN.md` (or the direction, before `DESIGN.md` exists) shows up somewhere you can point to.

## 1. Hierarchy

**Principle:** the eye lands first on what matters most, then moves in the order the task needs.

- [hard] Exactly one element is the most prominent on the screen. Squint or blur the shot: one thing still stands out.
- [hard] The primary action is easier to find than any secondary action. If two actions look equally important, only one of them should be.
- [soft] Prominence comes from at most two of size, weight, colour and position at once. Using all four on one element is shouting.
- [soft] Secondary text (meta, captions, help) is visibly quieter than body text, by lighter colour or smaller size, not both pushed to the limit.

## 2. Grouping

**Principle:** things that belong together look together, and things that do not are kept apart.

- [hard] The space between related items is clearly smaller than the space between groups. A label sits closer to its field than to the field above.
- [soft] Each group is separated by one device: space, a tone step, a box, or a line. Two at once (a boxed card with a divider inside a tinted panel) is noise.
- [soft] A reader can count the groups on the screen at a glance, and the count matches the sections the brief describes.

## 3. Alignment and grid

**Principle:** every element sits on a line shared with something else.

- [hard] Left edges of text blocks in one column line up. No block is nudged a few pixels off its neighbours.
- [soft] The screen has a small number of alignment lines (often a column grid). Draw them on the shot: an element that touches none of them needs a reason.
- [soft] Centred alignment is used for a single moment (an empty state, a hero line), not as the default for whole sections of left-reading content.
- [soft] Numbers in a column align on the right or on the decimal, so they compare.

## 4. Spacing rhythm

**Principle:** space comes from a short scale, and bigger gaps mean bigger separations.

- [soft] Every gap on the screen comes from the spacing scale in `DESIGN.md`. Measure five gaps at random: all are on the scale.
- [soft] There are at most three or four distinct gap sizes in one view, and each has a job (inside a component, between items, between groups, between sections).
- [soft] Nothing touches the edge of its container. Text inside a box has padding at least as large as the gap between its lines.
- [soft] Dense views stay dense on purpose: a table or list keeps tight rows rather than inheriting marketing-page spacing.

## 5. Typography

**Principle:** a few sizes, far apart, set for reading.

- [soft] The view uses at most five font sizes, and adjacent sizes are clearly different (roughly a 1.2× step or more), not 15, 16 and 17.
- [soft] Body text runs about 45 to 80 characters per line on desktop. Count one line.
- [soft] Body line height is visibly looser than heading line height. Headings of two lines do not drift apart.
- [soft] Weight does the work before size. A label is not set larger to be noticed when bold would do.
- [hard] No text is clipped, overlapped, or cut mid-word by its container, in any language the product ships.

## 6. Colour

**Principle:** colour carries meaning, and the meaning stays the same everywhere.

- [hard] Body text has a contrast ratio of at least 4.5:1 against its background. Large text (24px, or 18.66px bold, and up) and the visible parts of controls and icons have at least 3:1.
- [hard] Colour is never the only signal. An error, a selected item or a required field also changes shape, weight, an icon or text.
- [soft] Every colour on the screen is a token in `DESIGN.md`. Pick three at random: each maps to a named token.
- [soft] The accent colour marks action or state, and is not also used for decoration on the same screen.
- [soft] Status colours (error, warning, success) are used for status only.

## 7. Consistency

**Principle:** the same thing looks and behaves the same everywhere.

- [hard] One action has one look. Two primary buttons on different screens are the same component, same size and same label case.
- [soft] Components come from the Figma library or the codebase's components. A one-off that looks like a library component, but is slightly different, fails.
- [soft] Icons share a style: one stroke weight or one fill style, one corner treatment, one optical size.
- [soft] The same word means the same thing. "Delete" and "Remove" are not both used for one action.

## 8. States

**Principle:** every screen is shown in every state a person will meet.

- [hard] The screen has frames for empty, loading and error, next to the default. A missing state is a failure, not a later task.
- [hard] Empty says what goes here and gives the one action that fills it. Error says what went wrong in plain words and how to recover.
- [hard] Interactive components show hover (pointer surfaces), focus, pressed, disabled, and selected where they apply. Each state is visibly different from default.
- [soft] Loading keeps the layout's shape (skeleton or reserved space), so content does not jump when it arrives.
- [soft] Long content is shown: the longest real name, a big number, a two-line title. Short sample text hides overflow.

## 9. Affordance and feedback

**Principle:** what can be acted on looks like it, and every action visibly answers.

- [hard] Every interactive element looks interactive without hovering. Text links are distinct from body text by more than colour alone, unless their position makes them obvious (a nav bar).
- [hard] Nothing that looks interactive is not. A card that looks clickable is clickable, or loses the look.
- [soft] Each action has a visible result frame: a saved state, a toast, the item appearing in the list, a progress indicator for anything over a second.
- [soft] Destructive actions look different from safe ones and are never the default or most prominent option.

## 10. Accessibility

**Principle:** the screen works for people who see, move and read differently.

- [hard] The focused state of every interactive element shows a visible indicator with at least 3:1 contrast against what is around it. Check it in the focus frame.
- [hard] Targets are at least 24×24 CSS pixels, or have that much space around them (WCAG 2.2 AA). The app list raises this for touch.
- [hard] Every input has a visible label. A placeholder alone is not a label.
- [hard] Text is real text, not text in an image, except in logos.
- [soft] The screen still reads at 200% text size: nothing important is cut off in the zoomed frame.

## 11. Copy

**Principle:** words do the job of the screen in the product's own voice.

- [hard] No placeholder copy: no lorem ipsum, no "Title", no "Button", no "User Name".
- [soft] Buttons say what happens: "Send invoice", not "Submit", "OK", "Get started" or "Learn more".
- [soft] Headings are short. A heading that runs over two lines at its size is a sentence that belongs in the body.
- [soft] The voice matches `DESIGN.md`. Read three strings aloud: they sound like one product.
- [soft] No genre filler: unlock, supercharge, seamless, elevate, effortless, all-in-one, and "not just X, it's Y".

## 12. Imagery

**Principle:** pictures show the real thing, or there are none.

- [soft] Images show this product's subject, people or interface. A stock scene that fits any product in the category fails.
- [soft] Where a picture belongs, there is a picture, not a grey box, a gradient or a text block pretending.
- [soft] Images share one treatment: one crop logic, one colour handling, one corner shape.
- [hard] Text over an image meets the contrast floor in rule 6 across the whole text area, not only on the darkest part.

## 13. Responsive

**Principle:** each size is designed, not squeezed.

- [hard] At mobile width (360–390px) nothing scrolls sideways, nothing is clipped, and nothing overlaps.
- [hard] The primary action is reachable at every size without hunting: visible, or one obvious step away.
- [soft] The layout changes structure between sizes where it should: columns stack, tables become lists or scroll inside their own box, navigation collapses into one control.
- [soft] Type and spacing scale down a step on mobile, not to illegible sizes. Body text stays at least 16px.

## 14. Tells

**Dated 2026-11-03. Reviewed each release.** Add new tells, retire ones that stopped being defaults.

A tell is a device that makes a screen look produced by default rather than designed for this product. Most began as good ideas. They are tells because they arrive without a reason. Every check here is **soft**: present, and `DESIGN.md` gives no reason for it. This list never says what to use instead. That comes from the direction.

- [soft] Purple-to-blue gradients on backgrounds, buttons, glows or headline text.
- [soft] Translucent blurred panels used on two or more surfaces.
- [soft] The same soft grey shadow under every card.
- [soft] A row of three identical feature cards, each an icon in a rounded square, a heading and two lines.
- [soft] Emoji used as icons or bullets.
- [soft] A tiny tracked uppercase label above every heading, or a pill badge ("New", "Beta") above the hero line.
- [soft] One word of a headline singled out in another face, colour or underline.
- [soft] A cream ground with a terracotta or rust accent, used as a shortcut to "warm".
- [soft] Decorative monospace labels, index numbering (01 / 02 / 03) as ornament, hairline rules boxing everything, or design-tool marks (crosshairs, crop marks) as decoration.
- [soft] A fake dashboard made of grey bars and donut charts where a real interface fragment should be.
- [soft] Invented social proof: logos, quotes, star rows or user counts the product does not have.
- [soft] Every section in the same layout, or the stock order hero, logos, features, testimonial, pricing, call to action, when the argument needs another.
- [soft] One medium corner radius on everything, chosen by default rather than on purpose.

Removing tells is not the goal. A screen with none and no idea fails rule 0.

## Sites

Add these when the brief's surface is a site: the page a person lands on to understand or choose.

- [hard] The first screen at mobile and desktop says what this is and who it is for, without scrolling.
- [soft] Sections follow the order of the argument the brief makes, and each section is composed differently from the one before.
- [soft] There is one primary call to action, repeated at most at the end, with the same label.
- [soft] Proof is real (product shots, named customers the product has, numbers it can stand behind) or absent.

## Apps

Add these when the brief's surface is an app: the tool a person comes back to.

- [hard] Touch targets on touch platforms are at least 44×44 pt (Apple) or 48×48 dp (Material), whichever platform it ships on. The web floor in rule 10 still applies.
- [hard] The person always knows where they are: the current place in navigation is marked, and the screen title matches the nav item.
- [soft] Density fits repeated use. Lists and tables show enough rows to work, not marketing-sized cards.
- [soft] Navigation keeps the same place and shape on every screen of the flow.
- [soft] Frequent actions are one step away. Rare and destructive ones may be further.

## Sources

Ideas drawn from, in our own words: Gestalt principles of grouping; WCAG 2.2 (contrast 1.4.3 and 1.4.11, focus visible 2.4.7, target size 2.5.8, labels 3.3.2); Refactoring UI practice (Adam Wathan and Steve Schoger); Apple Human Interface Guidelines and Material Design basics (touch targets, navigation, states); and the tells registry of taste-skill by Leonxlnx (MIT).

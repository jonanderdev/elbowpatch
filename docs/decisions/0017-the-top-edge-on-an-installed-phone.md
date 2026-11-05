# 17. The top edge on an installed phone

Date: 2026-11-05 · Status: accepted

## Decision

Installed on a touch device, the app keeps a solid strip at the very top of the window: `.top-edge`, an empty element in `index.html`, 10px tall, in the page's colour, on top of every screen, letting touches through. Nothing else changes, and in a browser or on a desktop it is not shown.

## Why

Installed on an iPhone (iOS 27), the system draws a soft blur from the top of the screen down to about 95px, ending in a hard line across the head. It smears the top of § and the words beside it, and in night it shows as a faint shadow. No code of ours draws it: a bare page with no styles of ours shows the same band, and Safari does not show it at all.

The system leaves it out when the page has a solid fixed edge at the top, so we give every screen one. A scrolled screen already had one, the head's strip, which is why the blur only showed on a screen at rest.

## What it takes

Measured in the installed app on the iOS 27 simulator, in the top 360 device pixels of the screen:

| At the top of the window | The blur |
|---|---|
| Nothing, or a fixed element with no background | shown |
| A solid fixed element behind the page | shown |
| A solid fixed element 1px tall | shown |
| A `body::before` with the same styles | shown |
| A real solid fixed element 10px tall, on top | gone |

So it has to be on top and taller than 1px, and on `body` a `::before` will not do, though the strip on the sticky head is one and works. Perhaps the system goes by the element a `::before` hangs from; that was not tested, so `.top-edge` is a real element. 10px is enough, and it is where the head line starts, so it covers nothing. The smallest height that works was not looked for.

This relies on how the system behaves, not on anything it promises. No automated test can see it: our browser tests do not run the installed app on iOS. After an iOS update, check the top of an installed app on a phone.

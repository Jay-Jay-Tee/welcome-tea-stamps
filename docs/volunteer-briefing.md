# Volunteer briefing: Welcome Tea stamps

Wed 28 Oct, 3-6pm, COM3 MPH.

At your stall you scan each person's card, give them your stall's swag, and tick the swag box on your phone.

## Before doors open (2 minutes)
1. Get your station's login QR from the Tech Lead. Scan it with your phone camera and open the link. Your station's name shows at the top of the page.
2. Tap **Start camera** and allow camera access.
3. Keep the page open. Don't share the login QR, because anyone who has it can stamp as your stall.

## When someone comes to your stall
1. They show the QR code on their card page. Point your camera at it.
2. If you see **STAMPED**, give them your swag and tick **Swag handed over**.
3. Tap **Next person**.

If you see **ALREADY**, they were stamped at your stall before. You don't need to do anything. A card can only get one stamp per stall.

If you stamped the wrong person, tap **Undo this stamp**.

## If the camera won't scan
Type the 8 character code shown under their QR code, then tap **Go**.

## If the wifi is bad
Keep scanning. With no connection the screen shows **No connection. Stamp saved.** The stamp is sent automatically when the connection comes back, as long as you keep the page open. You can still give them their swag.

## If the wifi is completely down
Use the paper cards. Sign or stamp your stall's circle by hand, and let the Tech Lead know.

## Donut corner only
Log in with the donut corner QR, then scan each card.
- **GIVE DONUT** (green): give them a donut.
- **NO DONUT** (red): either the card already got a donut, or it doesn't have all 5 stamps yet. The screen says which. If they're not done, send them back to the stalls.
- **FINISHED**: the donuts have run out. Apologise and send them to a committee member.
- Paper card with every circle filled: give them a donut and cross out the "used" line.

If you gave a donut to the wrong card, tap **Undo (wrong card)**.

## If you lose your phone or someone sees your QR
Tell the Tech Lead. They'll make a new key, and your old login will stop working.

## Tech Cell stall only: the bug hunt
Once a card has the Tech Cell stamp, a hidden bug unlocks on the attendee's card page. Don't give it away. Point at the sign and say "there's a bug in the site, find it".
- Clue on their card: a grey line under the stamps, `// TODO: stop people tapping the donut so much`.
- Tapping the donut 5 times fast makes the site "corrupt", then drops them on a fake, unfinished "staff only" page. It looks broken on purpose and holds no real data. Pressing any of its admin buttons "breaks" the panel and drops them into the repair lab mission (nothing real changes). The real card and donut stock do not change.
- The glitch shows what went wrong; they tap the first bad log line, choose a one-line fix, and work through 3 short scenarios. The scenario varies by card. Wrong answers can be retried; a hint appears after 2 misses on one step. Only Close exits the repair lab.
- Progress is saved on the server, so they can reload and continue. The repair lab needs wifi, but the stamp card still works from its cache.
- They get 3 hearts. A wrong answer costs one. Losing all 3 reboots the lab with a different bug, and their clock keeps running. There are 9 different bugs, so friends can't just share answers. A clock shows how long they've taken.
- Solved: they pick a name for the Hall of Fame and see their rank ("#3 to squash the donut bug") plus a certificate preview and PNG download. A "Bug squashed" badge stays on their card; tapping it brings the rank and certificate back. Earlier Hall entries keep their rank.
- Keep `/hall.html` open on a laptop or screen at the stall. It shows every solver in order and updates by itself.

If they're stuck, ask what should happen when a tap is repeated or stock is empty. Nothing to hand out: solvers appear on the Hall of Fame automatically and save their own certificate. They can change their Hall of Fame name later with "Change my name".

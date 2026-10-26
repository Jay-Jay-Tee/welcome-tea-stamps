# Welcome Tea stamp rally

Digital stamp card for the SoC Welcome Tea (Wed 28 Oct 2026, 3-6pm, COM3 MPH). Attendees open a link on their own phone and get a card with no account. They collect a stamp at each of the five wing stalls, and a full card gets a free donut at the donut corner.

Volunteers scan the attendee's QR with their own phone. A forwarded link can't earn a stamp, because stamping needs a station's 16 character key, and keys are only handed out on login QRs.

## Run it locally
```
npm install
npm start          # http://localhost:3000, in-memory data, admin PIN is "admin"
npm test           # 200 simulated attendees plus the safety checks, a few seconds
```

## Pages
| Page | Who | What |
|---|---|---|
| `/` | Attendees | Card and QR. Refreshes every 6s. Shows the last saved copy if wifi drops |
| `/stall.html` | Volunteers | Opened from a station login QR. Scan or type a code, tick swag, undo |
| `/admin.html` | Tech Lead | Live counts, donut switch, station login QRs, new keys, card fixes, CSV, wipe |
| `/print.html` | Tech Lead | Door poster QR and paper fallback cards. Print it from the live address |

Volunteer handout: `docs/volunteer-briefing.md`.

## Changing the event
Everything event-specific lives in `config/event.json`: name, date, time, venue, stalls (with an icon and colour each), the reward and how many stamps it needs. Icons are drawn in `public/icons.js`: crown, people, globe, party, sprout, donut, star. Add more there. The server refuses to start if the config can't work, for example if it needs more stamps than there are stalls. Restart after editing. New stalls get keys automatically. Removed stalls lose their keys and their old stamps stop counting.

## Where it runs
Render, in the existing Computing Club workspace, as two new services in Singapore: a Starter web service and a basic Postgres. The Club website's service is untouched. Postgres only accepts connections from inside Render. Confirm prices on Render's pricing page, since the figures we have came from third-party summaries.

Repo: to be pushed to the NUSComputingDev GitHub org.

## Who has access
- **Render dashboard:** whoever the workspace owner invites.
- **Admin PIN:** the `ADMIN_PIN` environment variable in Render, at least 12 characters. It's never in the repo, and the server won't start in production without it.
- **Station keys:** random, generated on first boot, and kept across restarts. Visible on the admin page behind "Show keys". New key on the admin page replaces one instantly.

## Deploy (first time)
1. Push the repo to the NUSComputingDev org.
2. Render dashboard > New > Blueprint > pick the repo. It reads `render.yaml`.
3. Type an `ADMIN_PIN` when asked. Leave `PUBLIC_URL` blank unless you set up the custom domain.
4. Open `/admin.html` on the live address and log in.
5. Open `/print.html` on the live address and print it.
6. Test one phone of each kind (iOS Safari, Android Chrome): get a card, log in a station from its QR, stamp, redeem, undo. Then use **Wipe all cards and stamps**.
7. Optional custom domain `stamps.nuscomputing.com`: add it in the Render service settings, add a CNAME in Cloudflare set to DNS only, and set `PUBLIC_URL`. The Hobby plan includes 2 custom domains, and we don't know if the website's apex and www already use both. The onrender.com address works fine without it.

Start the paid instances a day or two before the event.

## On the day
- Volunteers scan their station's login QR from the admin page (QR button) or from a printed copy.
- When donuts run out, press **Mark donuts as finished**. Full cards then show a message and the donut corner can't give out more. Press **Donuts are available again** to undo.
- A card someone can't scan: fix it under "Fix a card" with the attendee's code.

## Reset
**Wipe all cards and stamps** on the admin page. It asks for the reset phrase, which is the `RESET_PHRASE` environment variable (set it in Render next to `ADMIN_PIN`; locally it defaults to `RESET`). Station keys stay. Do it after testing and before doors open.

## Bad wifi
- **Attendee card:** shows the last saved card, and the QR stays up. The page reopens even offline once it has loaded once.
- **Stall screen:** scans with no connection are saved on the phone and sent when wifi returns. The server ignores repeats.
- **No wifi at all:** paper cards from `/print.html`.
- **Donut corner:** needs a connection to check claims. Keep that phone on mobile data.

## Codes
Card codes are 8 characters and station keys 16, from an alphabet with no vowels and no digits that look like vowels, so they can't spell words. A blocklist in `src/codes.ts` catches consonant-only rude bits and digit stand-ins (like 5 for S), and any code that hits it is rerolled. The test checks 100,000 codes.

## Look
Matches nuscomputing.com: Club logo, DM Sans headings, Quicksand body, slate blue `#365486`, outlined cards with a solid offset shadow. Each wing has a colour and icon. The progress meter is a donut that gets one section of icing per stamp, with sprinkles in the colours of the stalls visited. Fonts load from Google Fonts and fall back to the phone's own font with no wifi.

## Privacy
Stores a random code, an optional nickname, stamps and a donut time. No names, emails or phone numbers. If contact details are ever collected, check PDPA with the staff advisor first. There's no lucky draw, so no draw rules are needed.

## Teardown after the event
1. Admin page > **Download CSV** if you want the numbers.
2. Render dashboard: delete the web service, then the Postgres database. Both bill monthly until deleted.
3. Remove the Cloudflare CNAME if you added one.
4. Keep the repo. For the next event, edit `config/event.json` and create a new Blueprint.

## Known gaps
- Club logo (`public/logo.png`) was taken from nuscomputing.com. Swap in an official file if Publicity has a cleaner one.
- Read through the card wording before the day.
- Not yet tried on real iOS Safari and Android Chrome. Camera access needs HTTPS, which Render provides.
- Anyone can make cards, so the "Cards" count on the admin page can be higher than the real number of people. The stamp and donut counts are accurate.

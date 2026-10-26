# Welcome Tea stamp rally

Digital stamp card for the SoC Welcome Tea (28 Oct 2026). Attendees open a link on their own phone, get a five slot card with no account, and collect a stamp at each wing's stall. A full card gets a free donut at the donut corner.

Volunteers scan the attendee's personal QR with their phone camera. Sharing a link can't earn a stamp, because only a volunteer with a stall PIN can add one.

## Run it locally
```
npm install
npm start          # http://localhost:3000, in-memory data, admin PIN is "admin"
npm test           # 200 simulated attendees, about 2 seconds
```

## Pages
| Page | Who | Notes |
|---|---|---|
| `/` | Attendees | Card, QR, 6 second refresh, works from a cached copy when wifi drops |
| `/stall.html` | Volunteers | Enter the station PIN. Scan or type a code. Swag tick and undo |
| `/admin.html` | Tech Lead | Counts, stock switch, PINs, manual stamp fix, CSV, wipe |
| `/print.html` | Tech Lead | Door poster QR and eight paper fallback cards per sheet |

Volunteer handout: `docs/volunteer-briefing.md`.

## Where it runs
Render, in the existing Computing Club workspace, as two new services (a Starter web service and a basic Postgres), both in Singapore. The Club website's service is untouched. Confirm prices on Render's pricing page, since they were taken from third party summaries.

Repo location: the NUSComputingDev GitHub org. (Not pushed yet. See "Deploy".)

## Who has access
- Render dashboard: whoever the workspace owner invites.
- Admin PIN: set by the Tech Lead as `ADMIN_PIN` in Render. Never in the repo.
- Station PINs: random 4 digits per station, generated on first boot, shown on the admin page. They survive restarts.

## Deploy (first time)
1. Push this repo to the NUSComputingDev org.
2. Render dashboard > New > Blueprint > pick the repo. It reads `render.yaml`.
3. When asked, type a value for `ADMIN_PIN`.
4. Open the web service URL. Visit `/admin.html`, log in, copy the station PINs into the briefing.
5. Open `/print.html` from the live URL and print it. The QR encodes whatever address you opened it from.
6. Optional: custom domain `stamps.nuscomputing.com`. Add the domain in the Render service settings, then a CNAME in Cloudflare set to DNS only. The Hobby plan includes 2 custom domains and it's unconfirmed whether the website's apex and www already use them. The onrender.com address is a fine fallback.

Start the paid instances a day or two before the event so there is time to test on iOS Safari and Android Chrome.

## Reset
Admin page > "Wipe all test data". Deletes all cards and stamps, keeps PINs. Do this after testing and before doors open.

## Reuse for the next event
Edit `config/event.json`: event name, date, venue, stalls, reward label and `stampsRequired`. Restart. New stalls get PINs automatically. The card, volunteer and admin pages read the config, nothing else changes. Station rows for removed stalls stay in the database until you delete the database, so a fresh Blueprint per event is cleanest.

## Donut stock
There is no count. When the donut corner runs out, press "Donut corner says no more donuts" on the admin page. Every card then shows "no more donuts" and the corner refuses claims. Press it again to undo.

## Bad wifi
- Attendee card: shows the last saved version and the QR stays visible.
- Stall screen: a scan that can't reach the server is saved on that phone and sent later. Repeats are ignored by the server.
- No wifi at all: paper cards from `/print.html`.
- Not covered: the donut corner needs the server, because claims have to be checked against the database. Keep a phone on mobile data there.

## Privacy
Stores a random code, an optional nickname, stamps and a donut timestamp. No names, emails or numbers. If contact details are ever collected for anything, check PDPA with the staff advisor first. Draw rules are not needed, there is no draw.

## Teardown after the event
1. Admin page > Download CSV (if you want the numbers), then check the file has no personal data you didn't expect.
2. Render dashboard: delete the web service, then delete the Postgres database. Both bill by the month until deleted.
3. Remove the Cloudflare CNAME if you added one.
4. Keep the repo. Config for the next event is one file.

## Known gaps
- No attempt limiter on PINs. Four digits on a public URL can be guessed. Fine for one afternoon with a quiet app, but don't reuse the PINs.
- Club logo is a text mark until a logo file is added to `public/`.
- Not yet tested on iOS Safari or Android Chrome. Camera scanning needs HTTPS, which Render gives you but localhost only fakes.

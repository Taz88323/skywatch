# Skywatch

A live aircraft map with military tracking and phone alerts. Every feature can be switched on or off in **Settings**.

## Get it

You need Python 3.9 or newer (macOS and most Linux systems already have it). Nothing else needs installing.

Either download the ZIP (green **Code** button → **Download ZIP**) and unzip it, or:

```
git clone https://github.com/Taz88323/skywatch.git
```

## Start it

```
cd skywatch
python3 server.py
```

Then open http://localhost:8080. Stop it with Ctrl+C.

On first run Skywatch creates `settings.json` with your own private alert topic. That file holds your personal settings and API key, so don't share it.

## Phone alerts (one-time setup)

1. Install the free **ntfy** app on your phone (App Store or Google Play).
2. In Skywatch, open **Settings → Phone alerts → Phone setup** and copy your topic name (it looks like `skywatch-xxxxxxxxxx`).
3. In the ntfy app, tap **+** and subscribe to that topic.
4. In Skywatch, set your **Home location**, turn on **Send alerts to my phone**, then press **Send test notification**.

Alerts are only checked **while `server.py` is running** on this computer. Your phone gets a notification the first time each matching aircraft comes within your alert radius. The same aircraft won't alert again until the "re-alert after" time has passed.

## Features you can toggle

| Map | Alerts |
| --- | --- |
| Military only / Civilian only / All (worldwide military) | Military aircraft in radius |
| My aircraft (your own groups) | Emergency squawks (7500/7600/7700) |
| | My aircraft groups with `"alert": true` |
| Military list panel | Watchlist (callsigns, registrations, hex codes) |
| Callsign labels | Alert radius |
| Flight trails | Ignore military above an altitude |
| Alert radius ring | Re-alert cooldown, check interval |
| Emergency highlighting | |
| Light / dark / system map, refresh rate, units | |

## Files

- `server.py` serves the page, saves settings to `settings.json` and runs the alert watcher.
- `static/` holds the web page (`index.html`, `app.js`, `style.css`).
- `alert-history.json` remembers recent alerts, so restarting the server doesn't send them again.
- `custom-aircraft/` holds your own aircraft groups, one `.json` file each. See `custom-aircraft/README.md`.

Aircraft data: [adsb.lol](https://adsb.lol) (free, open data). Map tiles: CARTO by default; add your free key from https://carto.com/basemaps/apikey in Settings → Map to remove the watermark. Military status comes from adsb.lol's aircraft database, so a few aircraft may be missing or mislabelled.
# development
# development

#!/usr/bin/env python3
"""Skywatch - a live aircraft map with military alerts sent to your phone.

Run:   python3 server.py          then open http://localhost:8080

No extra packages are needed. Aircraft data comes from the free adsb.lol API
and phone notifications are delivered through ntfy (https://ntfy.sh).
Phone alerts only run while this server is running.
"""
import argparse
import fnmatch
import http.client
import ipaddress
import json
import math
import re
import secrets
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
SETTINGS_FILE = BASE / "settings.json"
CUSTOM_DIR = BASE / "custom-aircraft"   # your own aircraft groups, one .json file each
HISTORY_FILE = BASE / "alert-history.json"   # recent alerts, so a restart doesn't re-alert everything
# Anything that can go wrong talking to adsb.lol or ntfy (URLError and TimeoutError are OSErrors).
NETWORK_ERRORS = (OSError, http.client.HTTPException)
DATA_API = "https://api.adsb.lol/v2"
USER_AGENT = "Skywatch/1.0 (personal aircraft tracker)"
EMERGENCY_SQUAWKS = {"7500": "hijack", "7600": "radio failure", "7700": "emergency"}
MAX_RADIUS_NM = 250  # largest radius the data API accepts

# Every setting the app knows about, with its default value.
DEFAULTS = {
    # Home location (used for distances and alerts)
    "home_lat": None,
    "home_lon": None,
    # Map features
    "military_only": False,
    "civilian_only": False,
    "worldwide_military": False,
    "custom_aircraft": False,
    "show_military_list": True,
    "show_labels": True,
    "type_icons": True,
    "show_trails": True,
    "show_home_ring": True,
    "highlight_emergencies": True,
    "map_style": "auto",
    "map_provider": "carto",
    "map_api_key": "",
    "refresh_seconds": 10,
    # Units
    "distance_unit": "nm",
    "altitude_unit": "ft",
    # Phone alerts
    "alerts_enabled": False,
    "alert_military": True,
    "alert_emergencies": False,
    "alert_watchlist": False,
    "alert_custom": True,
    "watchlist": "",
    "alert_radius_nm": 50.0,
    "alert_max_altitude_ft": 0,
    "cooldown_minutes": 30,
    "poll_seconds": 30,
    "ntfy_server": "https://ntfy.sh",
    "ntfy_topic": "",
}
LIMITS = {
    "refresh_seconds": (5, 120),
    "alert_radius_nm": (1, MAX_RADIUS_NM),
    "alert_max_altitude_ft": (0, 60000),
    "cooldown_minutes": (1, 1440),
    "poll_seconds": (15, 600),
}
CHOICES = {
    "distance_unit": {"nm", "km", "mi"},
    "altitude_unit": {"ft", "m"},
    "map_style": {"auto", "light", "dark"},
    "map_provider": {"carto", "maptiler", "thunderforest", "stadia", "mapbox"},
}
TOPIC_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
API_KEY_RE = re.compile(r"^[A-Za-z0-9._-]{1,300}$")


def make_ssl_context():
    """HTTPS settings that also work with the python.org installer on macOS,
    which ships without a certificate list of its own."""
    context = ssl.create_default_context()
    for bundle in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt"):
        if Path(bundle).exists():
            context.load_verify_locations(bundle)
            break
    return context


SSL_CONTEXT = make_ssl_context()


def coerce(key, value):
    """Check one incoming setting and convert it to the right type."""
    default = DEFAULTS[key]
    if key in ("home_lat", "home_lon"):
        if value is None or value == "":
            return None
        number = float(value)
        limit = 90 if key == "home_lat" else 180
        if not -limit <= number <= limit:
            raise ValueError(f"{key} must be between -{limit} and {limit}")
        return round(number, 5)
    if isinstance(default, bool):
        if not isinstance(value, bool):
            raise ValueError(f"{key} must be true or false")
        return value
    if isinstance(default, (int, float)):
        number = float(value)
        if math.isnan(number):
            raise ValueError(f"{key} must be a number")
        low, high = LIMITS[key]
        number = min(high, max(low, number))
        return int(round(number)) if isinstance(default, int) else round(number, 2)
    text = str(value).strip()[:1000]
    if key in CHOICES and text not in CHOICES[key]:
        raise ValueError(f"{key} must be one of {sorted(CHOICES[key])}")
    if key == "ntfy_server":
        text = text.rstrip("/")
        if not text.startswith(("https://", "http://")):
            raise ValueError("ntfy server must start with https://")
    if key == "ntfy_topic" and not TOPIC_RE.match(text):
        raise ValueError("Topic can only use letters, numbers, - and _ (max 64)")
    if key == "map_api_key" and text and not API_KEY_RE.match(text):
        raise ValueError("That API key contains unexpected characters. Check it was copied correctly.")
    return text


class Settings:
    """Settings stored in settings.json, shared by the web page and the alert watcher."""

    def __init__(self):
        self.lock = threading.Lock()
        self.data = dict(DEFAULTS)
        if SETTINGS_FILE.exists():
            try:
                saved = json.loads(SETTINGS_FILE.read_text())
                self.data.update({k: v for k, v in saved.items() if k in DEFAULTS})
            except (OSError, ValueError):
                print("Warning: settings.json could not be read, using defaults.")
        for key, (low, high) in LIMITS.items():   # keep older saved values within today's limits
            if isinstance(self.data[key], (int, float)):
                self.data[key] = type(DEFAULTS[key])(min(high, max(low, self.data[key])))
        if not self.data["ntfy_topic"]:
            # A random topic name, so strangers can't guess it and read your alerts.
            self.data["ntfy_topic"] = "skywatch-" + secrets.token_hex(5)
            self._save()

    def get(self):
        with self.lock:
            return dict(self.data)

    def update(self, changes):
        if not isinstance(changes, dict):
            raise ValueError("Expected a JSON object")
        clean = {}
        for key, value in changes.items():
            if key in DEFAULTS:
                try:
                    clean[key] = coerce(key, value)
                except (TypeError, ValueError) as err:
                    raise ValueError(str(err) if str(err) else f"Invalid value for {key}")
        # "Military only", "Civilian only" and "All" are exclusive: turning one on turns the others off.
        if clean.get("civilian_only") is True:
            clean["military_only"] = clean["worldwide_military"] = False
        if clean.get("military_only") is True:
            clean["civilian_only"] = clean["worldwide_military"] = False
        if clean.get("worldwide_military") is True:
            clean["civilian_only"] = clean["military_only"] = False
        with self.lock:
            self.data.update(clean)
            self._save()
            return dict(self.data)

    def _save(self):
        tmp = SETTINGS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2))
        tmp.replace(SETTINGS_FILE)


class RateLimited(Exception):
    """adsb.lol asked us to slow down and we have no earlier data to show."""

    def __init__(self, retry_in):
        super().__init__(f"adsb.lol is rate-limiting requests, retrying in {retry_in:.0f}s")
        self.retry_in = retry_in


MIN_GAP_SECONDS = 2.0      # never send adsb.lol more than one request per this many seconds
_cache = {}                # url -> (time fetched, data)
_cache_lock = threading.Lock()
_upstream_lock = threading.Lock()   # only one request to adsb.lol at a time
_last_request = 0.0
_backoff_until = 0.0
_backoff_step = 0


def rate_limited_for():
    """Seconds left in the current back-off (0 if none)."""
    return max(0.0, _backoff_until - time.time())


def _cached(url, max_age):
    with _cache_lock:
        hit = _cache.get(url)
    fresh = hit is not None and time.time() - hit[0] < max_age
    return hit, fresh


def fetch_json(url, max_age=8):
    """GET a JSON URL politely: reuse recent answers, space requests out, and back off
    when the server says 429 Too Many Requests (showing the last data meanwhile)."""
    global _last_request, _backoff_until, _backoff_step
    hit, fresh = _cached(url, max_age)
    if fresh:
        return hit[1]
    with _upstream_lock:
        hit, fresh = _cached(url, max_age)   # another request may have just fetched it
        if fresh:
            return hit[1]
        if rate_limited_for():
            if hit:
                return hit[1]
            raise RateLimited(rate_limited_for())
        wait = _last_request + MIN_GAP_SECONDS - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=15, context=SSL_CONTEXT) as response:
                data = json.load(response)
        except urllib.error.HTTPError as err:
            if err.code != 429:
                raise
            try:
                retry = float(err.headers.get("Retry-After", ""))
            except ValueError:
                retry = 15 * 2 ** _backoff_step      # 15s, 30s, 60s ... up to 5 min
            retry = min(300.0, max(5.0, retry))
            _backoff_step = min(_backoff_step + 1, 5)
            _backoff_until = time.time() + retry
            if hit:
                return hit[1]
            raise RateLimited(retry)
        _backoff_step = 0
        now = time.time()
        with _cache_lock:
            _cache[url] = (now, data)
            for old in [k for k, (t, _) in _cache.items() if now - t > 600]:
                del _cache[old]
        return data


RADIUS_BUCKETS = (10, 25, 50, 100, 150, 200, MAX_RADIUS_NM)


def area_query(lat, lon, radius):
    """Snap a map view to a coarse grid so small pans reuse the same request.
    Returns (lat, lon, radius) covering at least the requested circle."""
    bucket = next((b for b in RADIUS_BUCKETS if b >= radius), MAX_RADIUS_NM)
    step = bucket / 120                     # grid spacing in degrees (about bucket/2 nm)
    snap_lat = max(-89.9, min(89.9, round(lat / step) * step))
    snap_lon = ((round(lon / step) * step + 180) % 360) - 180
    padded = min(MAX_RADIUS_NM, math.ceil(bucket + step * 60))   # cover the snapping offset
    return snap_lat, snap_lon, padded


# ---------- formatting helpers for notification text ----------

def compass(degrees):
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][round((degrees % 360) / 45) % 8]


def callsign_of(ac):
    return (ac.get("flight") or "").strip() or ac.get("r") or ac["hex"].upper()


def fmt_distance(nm, unit):
    factor = {"nm": 1, "km": 1.852, "mi": 1.15078}[unit]
    value = nm * factor
    return f"{value:.1f} {unit}" if value < 10 else f"{value:.0f} {unit}"


def fmt_altitude(alt, unit):
    if alt == "ground":
        return "on the ground"
    if not isinstance(alt, (int, float)):
        return "altitude unknown"
    return f"{alt * 0.3048:,.0f} m" if unit == "m" else f"{alt:,.0f} ft"


def identifiers(ac):
    ids = {ac.get("hex", "").upper(), (ac.get("flight") or "").strip().upper(), (ac.get("r") or "").upper()}
    ids.discard("")
    return ids


# ---------- your own aircraft groups (custom-aircraft folder) ----------

# Field name in the .json files -> field name in the aircraft data
MATCH_FIELDS = {"callsign": "flight", "registration": "r", "hex": "hex", "type": "t",
                "category": "category", "squawk": "squawk"}
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def parse_group(path):
    """Read one group file and check it, raising ValueError with a friendly message."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise ValueError(f"not valid JSON (line {err.lineno}, column {err.colno}: {err.msg})")
    group = validate_group(data)
    group["name"] = group["name"] or path.stem
    return {"id": path.stem, "file": path.name, **group}


def validate_group(data):
    """Check a group's contents (from a file or from the settings editor)."""
    if not isinstance(data, dict):
        raise ValueError("the file must contain one { ... } object")
    color = data.get("color", "#14b8a6")
    if not isinstance(color, str) or not COLOR_RE.match(color):
        raise ValueError(f'"color" must look like "#14b8a6", got {color!r}')
    for flag in ("enabled", "alert"):
        if flag in data and not isinstance(data[flag], bool):
            raise ValueError(f'"{flag}" must be true or false (no quotes)')
    match = data.get("match")
    if not isinstance(match, dict) or not match:
        raise ValueError('needs a "match" section, e.g. "match": {"callsign": ["RESCUE*"]}')
    patterns = {}
    for field, values in match.items():
        if field not in MATCH_FIELDS:
            raise ValueError(f'unknown match field "{field}". Use: {", ".join(MATCH_FIELDS)}')
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
            raise ValueError(f'"{field}" must be a list of text, e.g. ["G-ABCD", "G-XY*"]')
        cleaned = [v.strip().upper() for v in values if v.strip()]
        if cleaned:
            patterns[field] = cleaned
    if not patterns:
        raise ValueError('"match" has no patterns in it')
    return {
        "name": str(data.get("name") or "").strip()[:60],
        "color": color.lower(),
        "enabled": data.get("enabled", True),
        "alert": data.get("alert", False),
        "patterns": patterns,
    }


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "group"


class CustomAircraft:
    """Loads custom-aircraft/*.json, re-reading automatically when a file changes."""

    def __init__(self):
        self.lock = threading.Lock()
        self.signature = None
        self.groups, self.errors = [], []

    def load(self):
        CUSTOM_DIR.mkdir(exist_ok=True)
        files = sorted(p for p in CUSTOM_DIR.glob("*.json") if not p.name.startswith("_"))
        try:
            signature = tuple((p.name, p.stat().st_mtime_ns, p.stat().st_size) for p in files)
        except OSError:
            signature = None   # a file vanished mid-scan: reload next time
        with self.lock:
            if signature is not None and signature == self.signature:
                return self.groups, self.errors
            groups, errors = [], []
            for path in files:
                try:
                    groups.append(parse_group(path))
                except (ValueError, OSError) as err:
                    errors.append({"file": path.name, "error": str(err)})
            self.groups, self.errors, self.signature = groups, errors, signature
            return groups, errors

    def active(self):
        return [g for g in self.load()[0] if g["enabled"]]

    def listing(self):
        groups, errors = self.load()
        return {
            "folder": str(CUSTOM_DIR),
            "groups": [{k: g[k] for k in ("id", "file", "name", "color", "enabled", "alert")}
                       | {"patterns": sum(len(v) for v in g["patterns"].values()), "match": g["patterns"]}
                       for g in groups],
            "errors": errors,
        }

    def save(self, body):
        """Create or update a group file from the settings editor. Returns the group id."""
        if not isinstance(body, dict):
            raise ValueError("Expected a group")
        group = validate_group({k: body.get(k) for k in ("name", "color", "enabled", "alert", "match")
                                if body.get(k) is not None})
        if not group["name"]:
            raise ValueError("Give the group a name")
        group_id = body.get("id")
        if group_id:
            existing = {g["id"]: g for g in self.load()[0]}
            if group_id not in existing:
                raise ValueError("That group's file no longer exists. Reload and try again.")
            path = CUSTOM_DIR / existing[group_id]["file"]
        else:
            base = slugify(group["name"])
            path, n = CUSTOM_DIR / f"{base}.json", 2
            while path.exists():
                path, n = CUSTOM_DIR / f"{base}-{n}.json", n + 1
        content = {"name": group["name"], "color": group["color"], "enabled": group["enabled"],
                   "alert": group["alert"], "match": group["patterns"]}
        CUSTOM_DIR.mkdir(exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(content, indent=2) + "\n", encoding="utf-8")
        tmp.replace(path)
        with self.lock:
            self.signature = None   # force a re-read
        return path.stem

    def delete(self, file_name):
        """Delete one group file (only files that are actually in the folder)."""
        files = {p.name: p for p in CUSTOM_DIR.glob("*.json")}
        if file_name not in files:
            raise ValueError("That file is no longer in the folder")
        files[file_name].unlink()
        with self.lock:
            self.signature = None


def group_matches(ac, group):
    for field, patterns in group["patterns"].items():
        value = str(ac.get(MATCH_FIELDS[field]) or "").strip().upper()
        if value and any(fnmatch.fnmatchcase(value, p) for p in patterns):
            return True
    return False


def matching_groups(ac, groups):
    return [g for g in groups if group_matches(ac, g)]


def alert_reasons(ac, s, watchlist, groups=()):
    """Return why this aircraft should trigger an alert (empty list = no alert)."""
    distance = ac.get("dst")
    if distance is None or distance > s["alert_radius_nm"]:
        return []
    reasons = []
    if s["alert_military"] and ac.get("dbFlags", 0) & 1:
        alt, ceiling = ac.get("alt_baro"), s["alert_max_altitude_ft"]
        too_high = ceiling and isinstance(alt, (int, float)) and alt > ceiling
        if not too_high:
            reasons.append("Military")
    if s["alert_emergencies"] and ac.get("squawk") in EMERGENCY_SQUAWKS:
        reasons.append("Emergency")
    if s["alert_watchlist"] and watchlist & identifiers(ac):
        reasons.append("Watchlist")
    if s["alert_custom"]:
        reasons.extend(g["name"] for g in matching_groups(ac, groups) if g["alert"])
    return reasons


def send_ntfy(s, title, message, tags="airplane", priority="default", click=None):
    url = f"{s['ntfy_server']}/{urllib.parse.quote(s['ntfy_topic'])}"
    headers = {
        "User-Agent": USER_AGENT,
        # HTTP headers must be plain Latin-1 text
        "Title": title.encode("latin-1", "replace").decode("latin-1"),
        "Tags": tags,
        "Priority": priority,
    }
    if click:
        headers["Click"] = click
    request = urllib.request.Request(url, data=message.encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=10, context=SSL_CONTEXT) as response:
        response.read()


class AlertWatcher(threading.Thread):
    """Background loop: look around home, notify about new matching aircraft."""

    def __init__(self, settings):
        super().__init__(daemon=True)
        self.settings = settings
        self.wake = threading.Event()  # set when settings change, to check right away
        self.lock = threading.Lock()
        self.last_sent = {}  # "hex|reason" -> time of last notification
        self.log = deque(maxlen=50)
        self.last_poll = None
        self.last_error = None
        self.in_range = 0
        self._load_history()

    def _load_history(self):
        try:
            saved = json.loads(HISTORY_FILE.read_text())
            now = time.time()
            self.last_sent = {str(k): float(t) for k, t in saved.get("last_sent", {}).items()
                              if now - float(t) < 86400}
            self.log.extend(e for e in saved.get("log", [])
                            if isinstance(e, dict) and isinstance(e.get("reasons"), list))
        except (OSError, ValueError, TypeError, AttributeError):
            pass   # no history yet, or unreadable: start fresh

    def _save_history(self):
        with self.lock:
            data = {"last_sent": dict(self.last_sent), "log": list(self.log)}
        try:
            tmp = HISTORY_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(data))
            tmp.replace(HISTORY_FILE)
        except OSError as err:
            print(f"Warning: could not save alert history: {err}")

    def run(self):
        while True:
            s = self.settings.get()
            if self.ready(s):
                try:
                    self.check(s)
                    self.last_error = None
                except Exception as err:  # keep the watcher alive whatever happens
                    self.last_error = f"{type(err).__name__}: {err}"
            self.wake.wait(s["poll_seconds"])
            self.wake.clear()

    @staticmethod
    def ready(s):
        return s["alerts_enabled"] and s["home_lat"] is not None and s["home_lon"] is not None

    def check(self, s):
        radius = math.ceil(s["alert_radius_nm"])
        url = f"{DATA_API}/point/{s['home_lat']:.4f}/{s['home_lon']:.4f}/{radius}"
        data = fetch_json(url, max_age=10)
        watchlist = {w.upper() for w in re.split(r"[,\s]+", s["watchlist"]) if w}
        groups = CUSTOM.active()
        now = time.time()
        cooldown = s["cooldown_minutes"] * 60
        in_range = 0
        send_errors = []
        changed = False
        for ac in data.get("ac", []):
            reasons = alert_reasons(ac, s, watchlist, groups)
            if not reasons:
                continue
            in_range += 1
            # The cooldown is per aircraft *and* reason, so a military jet that alerted
            # a few minutes ago still sends a fresh alert if it starts squawking 7700.
            keys = [f"{ac['hex']}|{r}" for r in reasons]
            if all(now - self.last_sent.get(k, 0) < cooldown for k in keys):
                continue
            try:
                self.notify(s, ac, reasons)
            except NETWORK_ERRORS as err:
                send_errors.append(str(err))
                continue
            for k in keys:
                self.last_sent[k] = now
            changed = True
        self.in_range = in_range
        self.last_poll = now
        stale = [k for k, t in self.last_sent.items() if now - t > 86400]
        for k in stale:
            del self.last_sent[k]
        if changed or stale:
            self._save_history()
        if send_errors:
            raise RuntimeError(f"Could not reach ntfy: {send_errors[0]}")

    def notify(self, s, ac, reasons):
        name = callsign_of(ac)
        details = " / ".join(x for x in (ac.get("t"), ac.get("r")) if x)
        where = f"{fmt_distance(ac['dst'], s['distance_unit'])} {compass(ac.get('dir', 0))} of home"
        lines = [details, f"{where}, {fmt_altitude(ac.get('alt_baro'), s['altitude_unit'])}"]
        if "Emergency" in reasons:
            lines.append(f"Squawking {ac['squawk']} ({EMERGENCY_SQUAWKS[ac['squawk']]})")
        message = "\n".join(line for line in lines if line)
        title = f"Nearby: {name} ({', '.join(reasons)})"
        urgent = "Emergency" in reasons or "Military" in reasons
        send_ntfy(
            s, title, message,
            tags="rotating_light,airplane" if "Emergency" in reasons else "airplane",
            priority="high" if urgent else "default",
            click=f"https://globe.adsb.lol/?icao={ac['hex']}",
        )
        with self.lock:
            self.log.appendleft({
                "time": time.time(), "hex": ac["hex"], "callsign": name,
                "reasons": reasons, "message": message,
                "lat": ac.get("lat"), "lon": ac.get("lon"),
            })

    def snapshot(self):
        s = self.settings.get()
        if not s["alerts_enabled"]:
            state = "off"
        elif s["home_lat"] is None or s["home_lon"] is None:
            state = "needs_home"
        elif self.last_error:
            state = "error"
        else:
            state = "active"
        with self.lock:
            log = list(self.log)
        return {"state": state, "last_poll": self.last_poll, "last_error": self.last_error,
                "in_range": self.in_range, "log": log}


class Handler(BaseHTTPRequestHandler):
    server_version = "Skywatch/1.0"

    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass

    # ----- responses -----
    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        types = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                 ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png"}
        try:
            body = path.read_bytes()
        except OSError:
            return self.send_error(404)
        self.send_response(200)
        self.send_header("Content-Type", types.get(path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        # Requiring JSON blocks other websites from silently posting to this server.
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise ValueError("Expected application/json")
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > 100_000:
            raise ValueError("Bad request size")
        return json.loads(self.rfile.read(length) or b"{}")

    def host_ok(self):
        """Only answer requests addressed to this computer by IP address or local name.
        This blocks "DNS rebinding", where a web page points its own domain name at
        127.0.0.1 so its scripts can read your settings or change them."""
        host = (self.headers.get("Host") or "").strip().lower()
        if host.startswith("["):                 # [::1]:8080
            host = host[1:].partition("]")[0]
        elif host.count(":") == 1:               # localhost:8080
            host = host.partition(":")[0]
        if host == "localhost" or host.endswith(".local"):
            return True
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return False

    # ----- routes -----
    def do_GET(self):
        if not self.host_ok():
            return self.send_error(403, "Unexpected Host header")
        path, _, query = self.path.partition("?")
        params = urllib.parse.parse_qs(query)
        if path in ("/", "/index.html"):
            return self.send_file(STATIC / "index.html")
        if path.startswith("/static/"):
            target = (STATIC / path[len("/static/"):]).resolve()
            if STATIC not in target.parents:
                return self.send_error(404)
            return self.send_file(target)
        if path == "/api/settings":
            return self.send_json(SETTINGS.get())
        if path == "/api/custom-aircraft":
            return self.send_json(CUSTOM.listing())
        if path == "/api/alerts":
            return self.send_json(WATCHER.snapshot())
        if path == "/api/aircraft":
            return self.aircraft(params)
        self.send_error(404)

    def do_POST(self):
        if not self.host_ok():
            return self.send_error(403, "Unexpected Host header")
        path = self.path.partition("?")[0]
        try:
            body = self.read_json()
        except ValueError as err:
            return self.send_json({"error": str(err)}, 400)
        if path == "/api/settings":
            try:
                updated = SETTINGS.update(body)
            except ValueError as err:
                return self.send_json({"error": str(err)}, 400)
            WATCHER.wake.set()
            return self.send_json(updated)
        if path == "/api/test-notification":
            s = SETTINGS.get()
            try:
                send_ntfy(s, "Skywatch test", "Notifications are working. You'll get alerts like this "
                          "when aircraft match your settings.", tags="white_check_mark,airplane")
            except NETWORK_ERRORS as err:
                return self.send_json({"error": f"Could not reach ntfy: {err}"}, 502)
            return self.send_json({"ok": True, "topic": s["ntfy_topic"]})
        if path in ("/api/custom-aircraft/save", "/api/custom-aircraft/delete"):
            try:
                if path.endswith("save"):
                    saved = CUSTOM.save(body)
                else:
                    CUSTOM.delete(str(body.get("file", "")))
                    saved = None
            except (ValueError, OSError) as err:
                return self.send_json({"error": str(err)}, 400)
            WATCHER.wake.set()
            return self.send_json(CUSTOM.listing() | {"saved_id": saved})
        self.send_error(404)

    def aircraft(self, params):
        try:
            if params.get("mil"):
                url = f"{DATA_API}/mil"
            else:
                lat = float(params["lat"][0])
                lon = float(params["lon"][0])
                radius = int(min(MAX_RADIUS_NM, max(1, float(params["radius"][0]))))
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError
                lat, lon, radius = area_query(lat, lon, radius)
                url = f"{DATA_API}/point/{lat:.3f}/{lon:.3f}/{radius}"
        except (KeyError, ValueError, IndexError):
            return self.send_json({"error": "Need lat, lon and radius"}, 400)
        try:
            data = fetch_json(url)
        except RateLimited as err:
            return self.send_json({"error": str(err), "retry_in": round(err.retry_in)}, 503)
        except (*NETWORK_ERRORS, ValueError) as err:
            return self.send_json({"error": f"Aircraft data unavailable: {err}"}, 502)
        aircraft = data.get("ac") or []
        if SETTINGS.get()["custom_aircraft"]:
            groups = CUSTOM.active()
            if groups:
                # Tag matches with their group ids (copying, so the cached data stays untouched).
                tagged = []
                for ac in aircraft:
                    ids = [g["id"] for g in matching_groups(ac, groups)]
                    tagged.append(dict(ac, sw_groups=ids) if ids else ac)
                aircraft = tagged
        self.send_json({"ac": aircraft, "now": data.get("now"),
                        "limited_for": round(rate_limited_for())})


SETTINGS = Settings()
CUSTOM = CustomAircraft()
WATCHER = AlertWatcher(SETTINGS)


def main():
    parser = argparse.ArgumentParser(description="Skywatch aircraft tracker")
    parser.add_argument("--host", default="127.0.0.1",
                        help="use 0.0.0.0 to open the map from other devices on your Wi-Fi")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    WATCHER.start()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Skywatch running at http://localhost:{args.port}")
    print(f"Phone alerts topic (subscribe in the ntfy app): {SETTINGS.get()['ntfy_topic']}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()

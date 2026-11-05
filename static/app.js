'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const UNITS = {
  nm: { factor: 1, speed: 'kt' },
  km: { factor: 1.852, speed: 'km/h' },
  mi: { factor: 1.15078, speed: 'mph' },
};
const EMERGENCY = { '7500': 'Hijack', '7600': 'Radio failure', '7700': 'Emergency' };
const MIL_COLOR = '#f97316';
const EMERG_COLOR = '#e5484d';
const STALE_MS = 45000;      // drop aircraft we haven't heard from in this long
const MAX_TRAIL = 120;       // points kept per trail
// Icon shapes (24x24, nose pointing up). size = drawn size in pixels.
const ICONS = {
  airliner: { label: 'Airliner', size: 22, path: 'M12 1.5c.8 0 1.3.9 1.3 2.2v5.1l8.2 4.6v2.2l-8.2-2.4v4.9l2.4 1.8v1.7L12 20.7l-3.7.9v-1.7l2.4-1.8v-4.9l-8.2 2.4v-2.2l8.2-4.6V3.7c0-1.3.5-2.2 1.3-2.2z' },
  heavy: { label: 'Heavy jet', size: 28, path: 'M12 1c.9 0 1.4 1 1.4 2.3v5.3l9.1 5v2l-9.1-2.6v5.2l2.6 2v1.6L12 21l-4 .8v-1.6l2.6-2V13l-9.1 2.6v-2l9.1-5V3.3C10.6 2 11.1 1 12 1zM8.3 7.6h1.6v3H8.3zM5.1 9.4h1.6v3H5.1zM14.1 7.6h1.6v3h-1.6zM17.3 9.4h1.6v3h-1.6z' },
  light: { label: 'Light aircraft', size: 19, path: 'M12 2.5C12.9 2.5 13.3 3.3 13.3 4.3V7H22.5V9.6H13.3L12.9 17.2L16.5 17.8V19.7H12.6L12 21L11.4 19.7H7.5V17.8L11.1 17.2L10.7 9.6H1.5V7H10.7V4.3C10.7 3.3 11.1 2.5 12 2.5Z' },
  heli: { label: 'Helicopter', size: 22, path: 'M12 5.5c1.9 0 3.2 2 3.2 4.6s-1.3 4.4-3.2 4.4-3.2-1.8-3.2-4.4S10.1 5.5 12 5.5zM11.4 14h1.2v6.2h2.6v1.3H8.8v-1.3h2.6zM3.5 3.9l.7-.7 16.3 16.3-.7.7zM19.8 3.2l.7.7L4.2 20.2l-.7-.7z' },
  fighter: { label: 'Fighter / fast jet', size: 22, path: 'M12 1L13.2 4.5V8L21 14.5V16.5L13.2 14.8V17.8L16.3 20.6V22L12.8 21.2H11.2L7.7 22V20.6L10.8 17.8V14.8L3 16.5V14.5L10.8 8V4.5Z' },
  warbird: { label: 'Prop fighter (e.g. Spitfire)', size: 22, path: 'M12 1.5c.7 0 1.1.7 1.1 1.6v4.1c5.4.3 9.4 1.2 9.4 2.4s-4 2.1-9.4 2.4l-.3 5.1c2.3.2 3.7.6 3.7 1.1s-1.6 1-3.9 1.1L12 20.8l-.6-1.5c-2.3-.1-3.9-.5-3.9-1.1s1.4-.9 3.7-1.1l-.3-5.1C5.5 11.7 1.5 10.8 1.5 9.6s4-2.1 9.4-2.4V3.1c0-.9.4-1.6 1.1-1.6z' },
  fourprop: { label: '4-engine prop (e.g. Lancaster)', size: 27, path: 'M12 1.8c.7 0 1 .8 1 1.8v4.9h10.2l-.4 2.5H13v6.9h4.5v-1h1v4.2h-1v-1H13l-1 .9-1-.9H6.5v1h-1v-4.2h1v1H11v-6.9H1.2l-.4-2.5H11V3.6c0-1 .3-1.8 1-1.8zM3.9 6.2h1.4v2.4H3.9zM7.7 5.8h1.4v2.8H7.7zM14.9 5.8h1.4v2.8h-1.4zM18.7 6.2h1.4v2.4h-1.4z' },
  glider: { label: 'Glider', size: 22, path: 'M12 3c.5 0 .8.6.8 1.4V8.6h10.4v1.3l-10.4.6-.3 8.7h2.8v1.3h-2.8L12 21l-.5-.5H8.7v-1.3h2.8l-.3-8.7-10.4-.6V8.6h10.4V4.4c0-.8.3-1.4.8-1.4z' },
  drone: { label: 'Drone', size: 17, path: 'M10 10h4v4h-4zM5.6 4.2l14.2 14.2-1.4 1.4L4.2 5.6zM18.4 4.2l1.4 1.4L5.6 19.8l-1.4-1.4zM2.4 5a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1-5.2 0zM16.4 5a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1-5.2 0zM2.4 19a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1-5.2 0zM16.4 19a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1-5.2 0z' },
  balloon: { label: 'Balloon / airship', size: 18, path: 'M12 2a7 7 0 0 1 7 7c0 3.6-3.4 6.6-5.6 8.4h-2.8C8.4 15.6 5 12.6 5 9a7 7 0 0 1 7-7zM10.6 18.4h2.8v2.8h-2.8z', noRotate: true },
  ground: { label: 'Ground vehicle', size: 14, path: 'M8.5 5h7a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 17.5v-11A1.5 1.5 0 0 1 8.5 5z' },
};
// Specific ICAO type codes first, then the ADS-B emitter category as a fallback.
const TYPE_ICONS = {};
const addTypes = (shape, codes) => codes.split(' ').forEach((c) => { TYPE_ICONS[c] = shape; });
addTypes('warbird', 'SPIT HURI P51 P47 P40 P39 P38 CORS F4U F6F F8F FURY T6 HARV TEX2 YAK3 YK11 YK52 ME09 FW90 MS30 BUCH TBM CHIP T28 B25');
addTypes('fourprop', 'LANC B17 B24 B29 C130 C30J A400 P3 DC4 DC6 DC7 CONI L188 AN12 IL18 SHAC VULC');
addTypes('fighter', 'F15 F16 F18 F18H F18S F35 F22 F14 F4 F5 EUFI TOR RFAL GRIF JAS9 A10 HAWK T38 M346 AJET L39 L159 MIR2 SU27 MG29 HUNT JAGR');
addTypes('heli', 'H47 H53 H60 H64 H1 UH1 EC20 EC25 EC30 EC35 EC45 EC55 EC75 AS32 AS50 AS55 AS65 A109 A119 A139 A169 A189 B06 B407 B412 B429 B505 R22 R44 R66 S76 S92 NH90 EH10 LYNX WILD H160 MI8 K32 PUMA GAZL');
addTypes('heavy', 'B741 B742 B743 B744 B748 B74S A388 A124 A225 AN22 C5 C5M C17 K35R K35E E3TF E3CF E6 B52 DC10 KC10 MD11 B772 B773 B77L B77W B788 B789 B78X A332 A333 A339 A359 A35K A343 A346 IL76 A3ST BLCF');
addTypes('glider', 'GLID ASK2 DG80 DISC LS8 VENT');
addTypes('balloon', 'BALL SHIP');
addTypes('light', 'C150 C152 C162 C170 C172 C177 C180 C182 C185 C206 C207 C210 P28A P28B P28R P28T P32R PA18 PA22 PA24 PA28 PA32 PA34 PA44 PA46 SR20 SR22 S22T DA20 DA40 DA42 DA62 BE33 BE35 BE36 BE55 BE58 M20P M20T TB10 TB20 RV4 RV6 RV7 RV8 RV9 RV10 RV12 AA5 J3 CUB GA8 TOBA EUPA DR40 G115 TUTR');
addTypes('ground', 'TWR GND');
const CATEGORY_ICONS = { A1: 'light', A5: 'heavy', A6: 'fighter', A7: 'heli', B1: 'glider', B2: 'balloon', B4: 'light', B6: 'drone', C1: 'ground', C2: 'ground', C3: 'ground' };

function iconShape(ac) {
  if (!S.type_icons) return 'airliner';
  return TYPE_ICONS[(ac.t || '').toUpperCase()] || CATEGORY_ICONS[ac.category] || 'airliner';
}

let S = null;                // current settings (from the server)
const tracked = new Map();   // hex -> { ac, marker, trail, positions, seen, key, label }
let selectedHex = null;
let refreshTimer = null, inFlight = false, pendingRefresh = false;
let lastUpdate = 0, lastError = null, clipped = false, rateNote = null, retryIn = 0;
let monitor = null;
let groups = new Map();      // id -> { name, color, alert, ... } from the custom-aircraft folder
let groupErrors = [];
let customFolder = '';

// ---------- map ----------
const map = L.map('map', { worldCopyJump: true, zoomControl: false, minZoom: 2 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// {apikey} in a URL is filled in from the "Map tiles API key" setting.
const PROVIDERS = {
  carto: {
    // A free key is required since Sept 2026; without one, tiles show a watermark.
    needsKey: true, signup: 'carto.com/basemaps/apikey (free)', attribution: `${OSM} &copy; CARTO`,
    light: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key={apikey}',
    dark: 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key={apikey}',
  },
  maptiler: {
    needsKey: true, signup: 'maptiler.com → Account → API keys', attribution: `&copy; MapTiler ${OSM}`,
    light: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key={apikey}',
    dark: 'https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}{r}.png?key={apikey}',
  },
  thunderforest: {
    needsKey: true, subdomains: 'abc', signup: 'thunderforest.com → Dashboard', attribution: `Maps &copy; Thunderforest, data ${OSM}`,
    light: 'https://{s}.tile.thunderforest.com/atlas/{z}/{x}/{y}{r}.png?apikey={apikey}',
    dark: 'https://{s}.tile.thunderforest.com/transport-dark/{z}/{x}/{y}{r}.png?apikey={apikey}',
  },
  stadia: {
    needsKey: true, signup: 'client.stadiamaps.com → API keys', attribution: `&copy; Stadia Maps &copy; OpenMapTiles ${OSM}`,
    light: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key={apikey}',
    dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key={apikey}',
  },
  mapbox: {
    needsKey: true, signup: 'account.mapbox.com → Access tokens', attribution: `&copy; Mapbox ${OSM}`,
    light: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}{r}?access_token={apikey}',
    dark: 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}{r}?access_token={apikey}',
  },
};
let activeTiles = null, activeTilesId = '';
const trailLayer = L.layerGroup().addTo(map);
const planeLayer = L.layerGroup().addTo(map);
let homeMarker = null, homeRing = null;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

// ---------- helpers ----------
const isMil = (ac) => (ac.dbFlags & 1) === 1;
// The server tags aircraft that match your groups with sw_groups: [group ids].
const groupsOf = (ac) => (S.custom_aircraft ? (ac.sw_groups || []).map((id) => groups.get(id)).filter(Boolean) : []);
const isHighlighted = (ac) => isMil(ac) || groupsOf(ac).length > 0;
const emergencyOf = (ac) => EMERGENCY[ac.squawk] || null;
const callsignOf = (ac) => (ac.flight || '').trim() || ac.r || ac.hex.toUpperCase();
const hasHome = () => S.home_lat != null && S.home_lon != null;
const headingOf = (ac) => ac.track ?? ac.true_heading ?? ac.mag_heading ?? 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDist(nm) {
  const u = S.distance_unit, v = nm * UNITS[u].factor;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u}`;
}
function fmtAlt(alt) {
  if (alt === 'ground') return 'On ground';
  if (typeof alt !== 'number') return '—';
  return S.altitude_unit === 'm' ? `${Math.round(alt * 0.3048).toLocaleString()} m` : `${alt.toLocaleString()} ft`;
}
function fmtSpeed(kt) {
  if (typeof kt !== 'number') return '—';
  const u = UNITS[S.distance_unit];
  return `${Math.round(kt * u.factor)} ${u.speed}`;
}
function fmtRate(fpm) {
  if (typeof fpm !== 'number') return '—';
  if (Math.abs(fpm) < 100) return 'Level';
  const v = S.altitude_unit === 'm' ? `${Math.round(fpm * 0.3048).toLocaleString()} m/min` : `${fpm.toLocaleString()} ft/min`;
  return `${fpm > 0 ? '↑ ' : '↓ '}${v.replace('-', '')}`;
}
function compass(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
function homeInfo(ac) {
  if (!hasHome()) return null;
  const toRad = (d) => d * Math.PI / 180;
  const lat1 = toRad(S.home_lat), lat2 = toRad(ac.lat), dLon = toRad(ac.lon - S.home_lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return {
    nm: L.latLng(S.home_lat, S.home_lon).distanceTo([ac.lat, ac.lon]) / 1852,
    bearing: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360,
  };
}
function altColor(alt) {
  if (alt === 'ground') return '#8a8f98';
  if (typeof alt !== 'number') return '#9aa3ad';
  const t = Math.max(0, Math.min(1, alt / 40000));
  return `hsl(${Math.round(140 + t * 140)}, 65%, 45%)`;   // green (low) → purple (high)
}
function planeColor(ac) {
  if (S.highlight_emergencies && emergencyOf(ac)) return EMERG_COLOR;
  const g = groupsOf(ac)[0];
  if (g) return g.color;
  return isMil(ac) ? MIL_COLOR : altColor(ac.alt_baro);
}
function toast(text, isError = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('err', isError);
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2200);
}
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

// ---------- aircraft markers ----------
function makeIcon(ac, sel) {
  const mil = isHighlighted(ac);
  const icon = ICONS[iconShape(ac)];
  const size = Math.round(icon.size * (mil ? 1.27 : 1));
  const rotate = icon.noRotate ? 0 : headingOf(ac);
  return L.divIcon({
    className: 'plane-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<svg class="plane${mil ? ' mil' : ''}${sel ? ' sel' : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${rotate}deg)"><path d="${icon.path}" fill="${planeColor(ac)}"/></svg>`,
  });
}

function renderEntry(e) {
  const ac = e.ac, sel = e.hex === selectedHex, mil = isMil(ac), group = groupsOf(ac)[0];
  const big = mil || !!group;
  const key = `${planeColor(ac)}|${Math.round(headingOf(ac) / 3)}|${sel}|${big}|${iconShape(ac)}`;
  if (key !== e.key) {
    e.marker.setIcon(makeIcon(ac, sel));
    e.marker.setZIndexOffset(sel ? 3000 : big ? 1000 : 0);
    e.key = key;
  }
  const text = S.show_labels && (big || map.getZoom() >= 8) ? callsignOf(ac) : null;
  const label = text && `${text}|${group ? group.color : mil ? 'mil' : ''}`;
  if (label !== e.label) {
    e.marker.unbindTooltip();
    if (text) {
      const html = group ? `<span style="color:${group.color}">${esc(text)}</span>` : esc(text);
      e.marker.bindTooltip(html, { permanent: true, direction: 'right', offset: [12, 0], className: `plane-label${mil && !group ? ' mil' : ''}` });
    }
    e.label = label;
  }
  if (S.show_trails && e.positions.length > 1) {
    if (!e.trail) e.trail = L.polyline([], { weight: 2, opacity: 0.7, interactive: false }).addTo(trailLayer);
    e.trail.setLatLngs(e.positions);
    e.trail.setStyle({ color: planeColor(ac) });
  } else if (e.trail) {
    e.trail.remove();
    e.trail = null;
  }
}

function ingest(list) {
  const now = Date.now();
  for (const ac of list) {
    if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue;
    // Your own groups always show, whatever the military/civilian filter says.
    const mine = S.custom_aircraft && ac.sw_groups?.length > 0;
    if (!mine && S.military_only && !isMil(ac)) continue;
    if (!mine && S.civilian_only && isMil(ac)) continue;
    if (ac.sw_groups && ac.sw_groups.some((id) => !groups.has(id))) needGroupReload = true;
    let e = tracked.get(ac.hex);
    if (!e) {
      e = { hex: ac.hex, positions: [], trail: null, key: '', label: null, marker: L.marker([ac.lat, ac.lon], { keyboard: false }) };
      e.marker.on('click', () => select(ac.hex));
      e.marker.addTo(planeLayer);
      tracked.set(ac.hex, e);
    }
    e.ac = ac;
    e.seen = now;
    e.marker.setLatLng([ac.lat, ac.lon]);
    const last = e.positions[e.positions.length - 1];
    if (!last || last[0] !== ac.lat || last[1] !== ac.lon) {
      e.positions.push([ac.lat, ac.lon]);
      if (e.positions.length > MAX_TRAIL) e.positions.shift();
    }
    renderEntry(e);
  }
  for (const [hex, e] of tracked) if (now - e.seen > STALE_MS) removeEntry(hex);
  if (needGroupReload) { needGroupReload = false; loadGroups(); }
}
let needGroupReload = false;

function removeEntry(hex) {
  const e = tracked.get(hex);
  if (!e) return;
  e.marker.remove();
  e.trail?.remove();
  tracked.delete(hex);
}
function clearAll() { [...tracked.keys()].forEach(removeEntry); }

function select(hex, fly = false) {
  const prev = selectedHex;
  selectedHex = hex;
  for (const h of [prev, hex]) { const e = tracked.get(h); if (e) renderEntry(e); }
  const e = tracked.get(hex);
  if (fly && e) map.setView([e.ac.lat, e.ac.lon], Math.max(map.getZoom(), 9));
  renderDetail();
  renderMilList();
}

// ---------- panels ----------
function renderDetail() {
  const panel = $('#detail');
  if (!selectedHex) { panel.hidden = true; return; }
  panel.hidden = false;
  const e = tracked.get(selectedHex);
  $('#detail-link').href = `https://globe.adsb.lol/?icao=${encodeURIComponent(selectedHex)}`;
  if (!e) {
    $('#detail-badges').innerHTML = '';
    $('#detail-body').innerHTML = '<dt>No longer receiving this aircraft.</dt><dd></dd>';
    return;
  }
  const ac = e.ac, h = homeInfo(ac), em = emergencyOf(ac);
  $('#detail-title').textContent = callsignOf(ac);
  $('#detail-badges').innerHTML =
    (isMil(ac) ? '<span class="badge mil">Military</span>' : '') +
    groupsOf(ac).map((g) => `<span class="badge" style="color:${g.color};background:${g.color}22">${esc(g.name)}</span>`).join('') +
    (em ? `<span class="badge emerg">${esc(em)} · ${esc(ac.squawk)}</span>` : '') +
    (ac.t ? `<span class="badge">${esc(ac.t)}</span>` : '');
  const rows = [
    ['Registration', ac.r],
    ['Aircraft type', ac.desc || ac.t],
    ['Operator', ac.ownOp],
    ['Altitude', fmtAlt(ac.alt_baro)],
    ['Vertical rate', fmtRate(ac.baro_rate ?? ac.geom_rate)],
    ['Ground speed', fmtSpeed(ac.gs)],
    ['Heading', ac.track != null ? `${Math.round(ac.track)}° ${compass(ac.track)}` : null],
    ['Squawk', ac.squawk],
    ['From home', h ? `${fmtDist(h.nm)} ${compass(h.bearing)}` : null],
    ['ICAO hex', ac.hex.toUpperCase()],
  ];
  $('#detail-body').innerHTML = rows.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
}

function renderMilList() {
  const panel = $('#mil-panel');
  panel.hidden = !S.show_military_list;
  if (panel.hidden) return;
  const showMil = !S.civilian_only;
  const items = [...tracked.values()]
    .filter((e) => (showMil && isMil(e.ac)) || groupsOf(e.ac).length)
    .map((e) => ({ e, h: homeInfo(e.ac) }));
  items.sort((a, b) => (a.h?.nm ?? 1e9) - (b.h?.nm ?? 1e9) || callsignOf(a.e.ac).localeCompare(callsignOf(b.e.ac)));
  $('#mil-title').textContent = S.custom_aircraft ? (showMil ? 'Military & my aircraft' : 'My aircraft') : 'Military';
  $('#mil-count').textContent = items.length;
  const list = $('#mil-list');
  if (!items.length) {
    list.innerHTML = `<li class="empty">${
      S.worldwide_military ? 'Loading military aircraft…'
      : !showMil && !S.custom_aircraft ? 'Civilian only is on, so no military aircraft are shown. Turn on My aircraft to list your groups here.'
      : 'None in this area. Zoom out or press All.'}</li>`;
    return;
  }
  list.innerHTML = items.slice(0, 300).map(({ e, h }) => {
    const ac = e.ac;
    const inZone = h && h.nm <= S.alert_radius_nm;
    const gs = groupsOf(ac);
    const swatch = `<i class="sw" style="background:${gs[0] ? gs[0].color : MIL_COLOR}"></i>`;
    const sub = [gs.map((g) => g.name).join(', '), ac.t, fmtAlt(ac.alt_baro), inZone ? '<span class="zone">In alert zone</span>' : ''].filter(Boolean);
    return `<li><button data-hex="${esc(ac.hex)}" class="${ac.hex === selectedHex ? 'sel' : ''}">
      <span class="cs">${swatch}${esc(callsignOf(ac))}</span>
      <span class="dist">${h ? `${fmtDist(h.nm)} ${compass(h.bearing)}` : ''}</span>
      <span class="sub">${sub.map((s) => (s.startsWith('<span') ? s : esc(s))).join(' · ')}</span>
    </button></li>`;
  }).join('');
}

function renderCounts() {
  let mil = 0, mine = 0;
  for (const e of tracked.values()) {
    if (isMil(e.ac)) mil++;
    if (groupsOf(e.ac).length) mine++;
  }
  const mineText = S.custom_aircraft ? ` · <b style="color:var(--mine)">${mine}</b> mine` : '';
  $('#counts').innerHTML = (S.military_only || S.worldwide_military
    ? `<b class="m">${mil}</b> military`
    : S.civilian_only ? `<b>${tracked.size}</b> civilian`
    : `<b>${tracked.size}</b> aircraft · <b class="m">${mil}</b> military`) + mineText;
}

function renderStatus() {
  const st = $('#status');
  st.classList.toggle('ok', !lastError && lastUpdate > 0);
  st.classList.toggle('err', !!lastError);
  $('#status-text').textContent = lastError ? `Data error: ${lastError}`
    : rateNote ? rateNote
    : lastUpdate ? `Updated ${ago(lastUpdate)}` : 'Connecting…';
  const notice = $('#notice');
  if (S?.worldwide_military) {
    notice.hidden = false;
    notice.textContent = S.custom_aircraft
      ? 'All: military aircraft worldwide (your non-military groups show in the normal view)'
      : 'All: military aircraft worldwide';
  }
  else if (clipped) { notice.hidden = false; notice.textContent = 'Zoomed out: showing 250 nm around the map centre'; }
  else notice.hidden = true;
}

// ---------- data loading ----------
async function refresh() {
  clearTimeout(refreshTimer);
  if (inFlight) { pendingRefresh = true; return; }
  inFlight = true;
  try {
    let url;
    if (S.worldwide_military) {
      url = '/api/aircraft?mil=1';
      clipped = false;
    } else {
      const c = map.getCenter().wrap();
      let r = Math.ceil(map.getCenter().distanceTo(map.getBounds().getNorthEast()) / 1852);
      clipped = r > 250;
      r = Math.min(250, Math.max(5, r));
      url = `/api/aircraft?lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}&radius=${r}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.retry_in) retryIn = data.retry_in;
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ingest(data.ac || []);
    lastUpdate = Date.now();
    lastError = null;
    rateNote = data.limited_for ? `adsb.lol asked us to slow down. Showing the last data, retrying in ${data.limited_for}s` : null;
    if (data.limited_for) retryIn = data.limited_for;
  } catch (err) {
    lastError = err.message;
  } finally {
    inFlight = false;
    renderCounts(); renderMilList(); renderDetail(); renderStatus();
    // Wait longer when the data service has asked us to back off.
    refreshTimer = setTimeout(refresh, Math.max(S.refresh_seconds, retryIn) * 1000);
    retryIn = 0;
    if (pendingRefresh) { pendingRefresh = false; refresh(); }
  }
}

let moveTimer = null;
map.on('moveend', () => {
  try { localStorage.setItem('skywatch-view', JSON.stringify([map.getCenter().lat, map.getCenter().lng, map.getZoom()])); } catch { /* storage unavailable */ }
  if (!S || S.worldwide_military) return;
  clearTimeout(moveTimer);
  moveTimer = setTimeout(refresh, 800);
});
map.on('zoomend', () => tracked.forEach(renderEntry));
map.on('click', () => { if (selectedHex) { select(null); } });

// ---------- phone-alert status ----------
async function loadMonitor() {
  try {
    const res = await fetch('/api/alerts');
    monitor = await res.json();
  } catch { monitor = null; }
  renderMonitor();
}
function renderMonitor() {
  const dot = $('#bell-dot'), box = $('#monitor');
  dot.className = 'bell-dot';
  if (!monitor) { box.className = 'monitor error'; box.textContent = 'Cannot reach the Skywatch server.'; return; }
  const radius = fmtDist(S.alert_radius_nm);
  const text = {
    off: 'Alerts are off.',
    needs_home: 'Set your home location below to start watching.',
    error: `Last check failed: ${monitor.last_error}`,
    active: `Watching ${radius} around home${monitor.last_poll ? ` · checked ${ago(monitor.last_poll * 1000)}` : ' · first check starting'}${monitor.in_range ? ` · ${monitor.in_range} matching now` : ''}`,
  }[monitor.state];
  box.className = `monitor ${monitor.state}`;
  box.textContent = text;
  if (monitor.state === 'active') dot.classList.add('on');
  if (monitor.state === 'error') dot.classList.add('err');
  $('#btn-alerts').title = `Phone alerts: ${text}`;

  const log = $('#alert-log');
  log.innerHTML = monitor.log.length
    ? monitor.log.map((a, i) => `<li><span class="when">${new Date(a.time * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <button data-alert="${i}">${esc(a.callsign)}</button> <span class="muted">· ${esc(a.reasons.join(', '))}</span>
        <div class="msg">${esc(a.message)}</div></li>`).join('')
    : '<li class="empty">No alerts sent yet.</li>';
}
$('#alert-log').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-alert]');
  if (!b) return;
  const a = monitor.log[Number(b.dataset.alert)];
  closeDrawer();
  if (a.lat != null) map.setView([a.lat, a.lon], 9);
  setTimeout(() => select(a.hex), 600);
});

// ---------- settings ----------
function fillSettingsForm() {
  for (const el of $$('[data-setting]')) {
    if (el === document.activeElement && el.type !== 'checkbox') continue;
    const k = el.dataset.setting;
    let v = S[k];
    if (el.type === 'checkbox') { el.checked = !!v; continue; }
    if (el.dataset.convert === 'dist') v = Math.round(v * UNITS[S.distance_unit].factor * 10) / 10;
    if (el.dataset.convert === 'alt' && S.altitude_unit === 'm') v = Math.round(v * 0.3048);
    el.value = v ?? '';
  }
  $$('.unit-dist').forEach((x) => { x.textContent = S.distance_unit; });
  $$('.unit-alt').forEach((x) => { x.textContent = S.altitude_unit; });
  $('#topic-show').textContent = S.ntfy_topic;
  const keyInput = $('#map-key-input');
  if (keyInput !== document.activeElement) keyInput.value = S.map_api_key || '';
  const provider = PROVIDERS[S.map_provider] || PROVIDERS.carto;
  $('#map-key-hint').textContent = S.map_api_key
    ? `Key saved on this computer. Make sure "Map tiles" matches the provider it came from (${provider.signup}).`
    : S.map_provider === 'carto'
    ? 'Without a key, CARTO tiles show a watermark. Get a free key at carto.com/basemaps/apikey.'
    : `Required. Until you add one, the map uses CARTO. Get a key at ${provider.signup}.`;
  $('#home-text').textContent = hasHome()
    ? 'Distances and phone alerts are measured from here.'
    : 'Not set. Phone alerts need a home location.';
  $('#chip-mil').setAttribute('aria-pressed', S.military_only);
  $('#chip-civ').setAttribute('aria-pressed', S.civilian_only);
  $('#chip-world').setAttribute('aria-pressed', S.worldwide_military);
  $('#chip-mine').setAttribute('aria-pressed', S.custom_aircraft);
  $('#icon-legend').hidden = !S.type_icons;
}

function readSetting(el) {
  if (el.type === 'checkbox') return el.checked;
  const raw = el.value.trim();
  if (el.type !== 'number') return raw;
  if (raw === '') return el.dataset.setting.startsWith('home_') ? null : undefined;
  let v = Number(raw);
  if (el.dataset.convert === 'dist') v /= UNITS[S.distance_unit].factor;
  if (el.dataset.convert === 'alt' && S.altitude_unit === 'm') v /= 0.3048;
  return v;
}

async function save(changes) {
  try {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save');
    const prev = S;
    S = data;
    applySettings(prev);
    setTimeout(loadMonitor, 1500);
    return true;
  } catch (err) {
    toast(err.message, true);
    fillSettingsForm();
    return false;
  }
}

async function saveMapKey() {
  const input = $('#map-key-input');
  const key = input.value.trim();
  const btn = $('#btn-save-key');
  btn.disabled = true;
  const ok = await save({ map_api_key: key });
  btn.disabled = false;
  if (!ok) return;
  input.blur();
  input.value = S.map_api_key;
  toast(key ? 'API key saved. The map now uses your key.' : 'API key removed');
}
$('#btn-save-key').onclick = saveMapKey;
$('#map-key-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); saveMapKey(); }
});
$('#btn-show-key').onclick = () => {
  const input = $('#map-key-input'), btn = $('#btn-show-key');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
  btn.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
};

function drawHome() {
  homeMarker?.remove(); homeRing?.remove();
  homeMarker = homeRing = null;
  if (!hasHome()) return;
  const at = [S.home_lat, S.home_lon];
  homeMarker = L.marker(at, { icon: L.divIcon({ className: 'home-icon', html: '<div class="home-dot"></div>', iconSize: [16, 16] }), interactive: false, keyboard: false, zIndexOffset: 4000 }).addTo(map);
  if (S.show_home_ring) {
    homeRing = L.circle(at, { radius: S.alert_radius_nm * 1852, color: MIL_COLOR, weight: 1.5, dashArray: '6 6', fillOpacity: 0.04, interactive: false }).addTo(map);
  }
}

function applyTiles() {
  const style = S.map_style === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : S.map_style;
  let name = PROVIDERS[S.map_provider] ? S.map_provider : 'carto';
  const hasKey = !!S.map_api_key;
  if (!hasKey) name = 'carto';   // no key yet: CARTO still works, just with a watermark
  const p = PROVIDERS[name];
  const url = hasKey ? p[style] : p[style].replace(/\?key=\{apikey\}$/, '');
  const id = `${name}|${style}|${S.map_api_key}`;
  if (id === activeTilesId) return;
  activeTiles?.remove();
  activeTiles = L.tileLayer(url, {
    attribution: p.attribution,
    subdomains: p.subdomains || 'abc',
    maxZoom: 19,
    apikey: encodeURIComponent(S.map_api_key || ''),
  });
  let warned = false;
  activeTiles.on('tileerror', () => {
    if (warned) return;
    warned = true;
    toast(p.needsKey ? 'Map tiles failed to load. Check your API key in Settings → Map.' : 'Map tiles failed to load. Check your internet connection.', true);
  });
  activeTiles.addTo(map);
  activeTilesId = id;
}

function applySettings(prev = {}) {
  applyTiles();
  drawHome();
  fillSettingsForm();
  if (prev.custom_aircraft !== S.custom_aircraft && S.custom_aircraft) loadGroups();
  if (prev.military_only !== S.military_only || prev.worldwide_military !== S.worldwide_military
      || prev.civilian_only !== S.civilian_only || prev.custom_aircraft !== S.custom_aircraft) {
    clearAll();
    refresh();
  } else {
    tracked.forEach((e) => { e.key = ''; renderEntry(e); });
    if (prev.refresh_seconds !== S.refresh_seconds) refresh();
  }
  renderCounts(); renderMilList(); renderDetail(); renderStatus(); renderMonitor();
}

document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-setting]');
  if (!el) return;
  const value = readSetting(el);
  if (value === undefined || Number.isNaN(value)) { fillSettingsForm(); return; }
  save({ [el.dataset.setting]: value });
});
darkQuery.addEventListener('change', () => S && applyTiles());

// ---------- buttons ----------
// The server turns the other two filters off when one of these is switched on.
$('#chip-mil').onclick = () => save({ military_only: !S.military_only });
$('#chip-civ').onclick = () => save({ civilian_only: !S.civilian_only });
$('#chip-world').onclick = () => save({ worldwide_military: !S.worldwide_military });
$('#chip-mine').onclick = () => save({ custom_aircraft: !S.custom_aircraft });

// ---------- my aircraft groups ----------
async function loadGroups() {
  try {
    const data = await (await fetch('/api/custom-aircraft')).json();
    groups = new Map(data.groups.map((g) => [g.id, g]));
    groupErrors = data.errors;
    customFolder = data.folder;
  } catch {
    return;
  }
  renderGroups();
  if (S) {
    tracked.forEach((e) => { e.key = ''; e.label = undefined; renderEntry(e); });
    renderCounts(); renderMilList(); renderDetail();
  }
}
function renderGroups() {
  $('#custom-folder').textContent = customFolder;
  const rows = [...groups.values()].map((g) => `<li class="${g.enabled ? '' : 'g-off'}">
      <i class="sw" style="background:${g.color}"></i>
      <span><span class="g-name">${esc(g.name)}</span>
      <span class="g-meta">${esc(g.file)} · ${g.patterns} pattern${g.patterns === 1 ? '' : 's'}${g.enabled ? '' : ' · switched off'}${g.alert ? ' · phone alerts on' : ''}</span></span>
      <button type="button" class="link-btn" data-edit="${esc(g.id)}">Edit</button></li>`);
  for (const err of groupErrors) {
    rows.push(`<li class="g-err"><i class="sw" style="background:var(--emerg)"></i>
      <span><span class="g-name">${esc(err.file)}</span> <span class="g-meta">${esc(err.error)}. Fix it in a text editor, or delete it.</span></span>
      <button type="button" class="link-btn danger" data-delfile="${esc(err.file)}">Delete</button></li>`);
  }
  $('#group-list').innerHTML = rows.join('') || '<li class="g-meta">No groups yet. Press <b>+ New group</b> to make one.</li>';
}

// ----- group editor -----
const EDIT_FIELDS = ['callsign', 'registration', 'hex', 'type', 'category', 'squawk'];
let editingId = null;   // id of the group being edited, or null for a new one

function splitPatterns(text) {
  return text.split(/[\s,;]+/).map((v) => v.trim().toUpperCase()).filter(Boolean);
}

function openEditor(id = null) {
  editingId = id;
  const g = id ? groups.get(id) : null;
  $('#ge-title').textContent = g ? `Edit "${g.name}"` : 'New group';
  $('#ge-name').value = g ? g.name : '';
  $('#ge-color').value = g ? g.color : '#14b8a6';
  $('#ge-enabled').checked = g ? g.enabled : true;
  $('#ge-alert').checked = g ? g.alert : false;
  for (const f of EDIT_FIELDS) $(`#ge-${f}`).value = (g?.match?.[f] || []).join(', ');
  $('#ge-delete').hidden = !g;
  resetDeleteButton($('#ge-delete'));
  $('#ge-error').hidden = true;
  const sel = selectedHex && tracked.get(selectedHex);
  const addBtn = $('#ge-add-selected');
  addBtn.hidden = !sel;
  if (sel) addBtn.textContent = `+ Add the selected aircraft (${callsignOf(sel.ac)}, hex ${sel.ac.hex.toUpperCase()})`;
  $('#group-view').hidden = true;
  $('#group-editor').hidden = false;
  $('#sec-mine').scrollIntoView({ block: 'start' });
  $('#ge-name').focus();
}

function closeEditor() {
  editingId = null;
  $('#group-editor').hidden = true;
  $('#group-view').hidden = false;
}

function editorError(text) {
  const el = $('#ge-error');
  el.textContent = text;
  el.hidden = !text;
}

async function postGroups(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

async function applyGroupListing(data) {
  groups = new Map(data.groups.map((g) => [g.id, g]));
  groupErrors = data.errors;
  customFolder = data.folder;
  renderGroups();
  tracked.forEach((e) => { e.key = ''; e.label = undefined; renderEntry(e); });
  renderCounts(); renderMilList(); renderDetail();
  if (S.custom_aircraft) refresh();   // fetch again so the server re-tags aircraft with the new rules
}

$('#group-editor').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('#ge-name').value.trim();
  const match = {};
  for (const f of EDIT_FIELDS) {
    const list = splitPatterns($(`#ge-${f}`).value);
    if (list.length) match[f] = list;
  }
  if (!name) return editorError('Give the group a name.');
  if (!Object.keys(match).length) return editorError('Add at least one callsign, registration, hex code, type, category or squawk.');
  const btn = $('#ge-save');
  btn.disabled = true;
  try {
    const data = await postGroups('/api/custom-aircraft/save', {
      id: editingId, name, color: $('#ge-color').value,
      enabled: $('#ge-enabled').checked, alert: $('#ge-alert').checked, match,
    });
    closeEditor();
    await applyGroupListing(data);
    toast(S.custom_aircraft ? `Saved "${name}"` : `Saved "${name}". Turn on My aircraft to see it on the map.`);
  } catch (err) {
    editorError(err.message);
  } finally {
    btn.disabled = false;
  }
});

// Deleting takes two presses: the first arms the button, the second deletes.
function resetDeleteButton(btn) {
  clearTimeout(btn._t);
  btn.classList.remove('confirm');
  btn.textContent = btn.dataset.label || btn.textContent;
}
function armOrConfirm(btn) {
  if (btn.classList.contains('confirm')) { resetDeleteButton(btn); return true; }
  btn.dataset.label = btn.textContent;
  btn.classList.add('confirm');
  btn.textContent = 'Press again to delete';
  btn._t = setTimeout(() => resetDeleteButton(btn), 4000);
  return false;
}
async function deleteGroupFile(file, label) {
  try {
    const data = await postGroups('/api/custom-aircraft/delete', { file });
    closeEditor();
    await applyGroupListing(data);
    toast(`Deleted ${label}`);
  } catch (err) {
    toast(err.message, true);
  }
}
$('#ge-delete').onclick = () => {
  const g = groups.get(editingId);
  if (g && armOrConfirm($('#ge-delete'))) deleteGroupFile(g.file, `"${g.name}"`);
};
$('#ge-cancel').onclick = closeEditor;
$('#ge-add-selected').onclick = () => {
  const sel = tracked.get(selectedHex);
  if (!sel) return;
  const box = $('#ge-hex');
  const list = splitPatterns(box.value);
  if (!list.includes(sel.ac.hex.toUpperCase())) list.push(sel.ac.hex.toUpperCase());
  box.value = list.join(', ');
  toast(`Added ${callsignOf(sel.ac)}. Press Save group to keep it.`);
};
$('#btn-new-group').onclick = () => openEditor(null);
$('#group-list').addEventListener('click', (ev) => {
  const edit = ev.target.closest('[data-edit]');
  if (edit) return openEditor(edit.dataset.edit);
  const del = ev.target.closest('[data-delfile]');
  if (del && armOrConfirm(del)) deleteGroupFile(del.dataset.delfile, del.dataset.delfile);
});
$('#btn-reload-groups').onclick = async () => {
  await loadGroups();
  toast(groupErrors.length ? `${groupErrors.length} file(s) have problems. See the list.` : `Loaded ${groups.size} group(s)`, groupErrors.length > 0);
};
$('#detail-close').onclick = () => select(null);
$('#mil-toggle').onclick = () => {
  const p = $('#mil-panel');
  p.classList.toggle('collapsed');
  $('#mil-toggle').setAttribute('aria-expanded', !p.classList.contains('collapsed'));
};
$('#mil-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-hex]');
  if (b) select(b.dataset.hex, true);
});

function openDrawer(sectionId) {
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  loadMonitor();
  loadGroups();
  if (sectionId) $(`#${sectionId}`).scrollIntoView({ block: 'start' });
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
}
$('#btn-settings').onclick = () => openDrawer();
$('#btn-alerts').onclick = () => openDrawer('sec-alerts');
$('#drawer-close').onclick = closeDrawer;
$('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDrawer(); });

$('#btn-test').onclick = async () => {
  const btn = $('#btn-test');
  btn.disabled = true;
  try {
    const res = await fetch('/api/test-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast(`Test sent to topic "${data.topic}". Check your phone.`);
  } catch (err) {
    toast(err.message || 'Could not send test', true);
  } finally {
    btn.disabled = false;
  }
};

$('#btn-locate').onclick = () => {
  if (!navigator.geolocation) return toast('Location is not available in this browser', true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      save({ home_lat: pos.coords.latitude, home_lon: pos.coords.longitude });
      map.setView([pos.coords.latitude, pos.coords.longitude], 9);
    },
    (err) => toast(`Could not get location: ${err.message}`, true),
    { enableHighAccuracy: false, timeout: 15000 },
  );
};
$('#btn-center').onclick = () => {
  const c = map.getCenter().wrap();
  save({ home_lat: c.lat, home_lon: c.lng });
};

// ---------- start ----------
async function start() {
  try {
    S = await (await fetch('/api/settings')).json();
  } catch {
    $('#status-text').textContent = 'Cannot reach the Skywatch server. Is server.py running?';
    return;
  }
  let view = null;
  try { view = JSON.parse(localStorage.getItem('skywatch-view')); } catch { /* ignore */ }
  if (hasHome()) map.setView([S.home_lat, S.home_lon], 8);
  else if (Array.isArray(view)) map.setView([view[0], view[1]], view[2]);
  else map.setView([51.5, -0.12], 7);

  $('#icon-legend').innerHTML = Object.values(ICONS)
    .map((i) => `<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${i.path}"/></svg>${i.label}</span>`).join('');
  await loadGroups();
  applySettings({ military_only: S.military_only, civilian_only: S.civilian_only, worldwide_military: S.worldwide_military,
    custom_aircraft: S.custom_aircraft, refresh_seconds: S.refresh_seconds });
  refresh();
  loadMonitor();
  setInterval(() => { if (S.custom_aircraft) loadGroups(); }, 20000);   // pick up edited group files
  setInterval(loadMonitor, 15000);
  setInterval(renderStatus, 1000);
  if (!hasHome()) setTimeout(() => toast('Tip: set your home location in Settings to enable phone alerts'), 1200);
}
start();

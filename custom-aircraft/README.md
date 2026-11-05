# My aircraft

Put your own aircraft groups in this folder. Each `.json` file is one group, for example
`air-ambulances.json`, `police.json` or `my-friends-plane.json`. Turn the feature on and off with
the **My aircraft** button at the top of Skywatch.

The easiest way to manage groups is **Settings → My aircraft** in Skywatch. It creates, edits and
deletes these files for you. You can also edit them by hand: Skywatch notices new or edited files on its own,
so you don't need to restart it.
Files whose names start with `_` (like `_template.json`) are ignored, so copy the template to a new name to use it.

## File format

```json
{
  "name": "Air ambulances",
  "color": "#14b8a6",
  "enabled": true,
  "alert": true,
  "match": {
    "callsign": ["HLE*", "RESCUE*"],
    "registration": ["G-EMSY", "G-NHAA"],
    "hex": ["4007F2"],
    "type": ["EC35", "H145"],
    "category": ["A7"],
    "squawk": ["0020"]
  }
}
```

| Field | Meaning |
| --- | --- |
| `name` | Shown on the map, in the list, and in phone alerts. |
| `color` | Colour of the aircraft icon, as `#` and six hex digits. |
| `enabled` | `false` switches just this group off. |
| `alert` | `true` sends a phone alert when one of these aircraft enters your alert radius. |
| `match` | An aircraft is in the group if **any** of the patterns match. You only need the fields you use. |

Match fields:

- **`callsign`**: the flight ID shown on the map, e.g. `RCH123`.
- **`registration`**: the tail number, e.g. `G-ABCD`, `N12345`.
- **`hex`**: the 6-character ICAO address, e.g. `43C6F1`.
- **`type`**: the ICAO type code, e.g. `C17`, `EC35`, `B738`.
- **`category`**: the ADS-B emitter category, e.g. `A7` helicopter, `B6` drone, `A1` light aircraft, `A5` heavy.
- **`squawk`**: the transponder code, e.g. `7700`.

Matching ignores upper/lower case. `*` matches anything (`G-HEM*`), and `?` matches one character.
Click an aircraft on the map to see its callsign, registration, type and hex, so you can copy them here.

If a file has a mistake, Skywatch shows the problem under **Settings → My aircraft**.

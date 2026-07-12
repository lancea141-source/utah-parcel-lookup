# Lance RE Tools — Version Registry

Updated: 2026-07-11

| File | Version | Date | Notes |
|---|---|---|---|
| showing-sheet.gs | v43 | 2026-07-11 | 🔗 Property Links column, DWR wells w/ WIN links, GPS caching, fast SGID lookup |
| links.html | v2 | 2026-07-11 | Photo banner, Call/Text Lance, logo header, noindex |
| boundary.html | v4 | 2026-07-11 | Detail popup (owner/acres/address), single popup fix, version badge |
| wells.html | v2 | 2026-07-11 | Utah DWR well logs, drilling-log links, 💧 pins |
| VERSIONS.md | — | 2026-07-11 | This file |
| logo.png | — | 2026-07-11 | Brand asset, navy #31414F background |

## History

| Version | What changed |
|---|---|
| showing-sheet v39 | Unified land + residential, multi-block paste |
| showing-sheet v40 | Parcel-specific County Recorder links (Utah Co deep link, Sanpete SGID explorer, UGRC CoParcel_URL fallback) |
| showing-sheet v41 | API key moved to Script Properties (🔑 menu) |
| showing-sheet v43 | Links column → links.html, DWR wells, GPS cache, SGID slimmed |
| boundary v2 | Popup + county button (county button later removed) |
| boundary v3 | County button removed, popup kept |
| boundary v4 | Placeholder pin removed after boundary loads |
| links v1 | Initial links page |
| links v2 | Photo banner, Call/Text buttons |
| wells v1 | USGS version (API retired by USGS) |
| wells v2 | Utah DWR well logs |

## Rules
- Version lives in line 1–2 of every file + a visible badge on each page
- Commit message = file + version (e.g. `boundary v4`)
- Full history: GitHub → file → History → click any commit to view/restore
- API key NEVER in this repo — set per-sheet via 🔑 menu (Script Properties)
- Real key lives only in Apps Script; new sheet copies need 🔑 run once

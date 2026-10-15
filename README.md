# Meeting Point

Find the fair middle between a set of addresses, on the surface of the Earth.

Type addresses into the search bar (OpenStreetMap autocomplete), press **Calculate middle**, and the app shows the point that is the average of everyone's location, with the nearest street address, the distance each person would travel, and links to open it in Google Maps or OpenStreetMap.

Live: https://roeyov.github.io/meeting-point/

## Features

- Address autocomplete through [Photon](https://photon.komoot.io) (OpenStreetMap data, no API key, Hebrew and other scripts work)
- Several groups, each with its own colour, name and result; show or hide them on the map
- Edit any address: rename it, swap it for another one, change its weight (how many people come from there), or drag its marker on the map
- Three definitions of "middle":
  - **Average location** – the centre of gravity of all points on the globe
  - **Least total travel** – the geometric median, which one far-away outlier barely moves
  - **Shortest longest trip** – the minimax centre, so nobody travels further than necessary
- **Middle of everyone** across all visible groups
- Per-person distance to the middle, with a bar so you can see who travels most
- Use my location, paste a whole list at once (`Name: address` per line), and a share link that carries every group
- Everything is stored in your browser; nothing is sent anywhere except the geocoding queries

## The math

Averaging latitude and longitude directly breaks at the date line and the poles. Instead every address becomes a unit vector on the sphere:

```
x = cos(lat)·cos(lng)   y = cos(lat)·sin(lng)   z = sin(lat)
```

The weighted mean of those vectors is projected back onto the sphere:

```
lng = atan2(Y, X)       lat = atan2(Z, √(X² + Y²))
```

If the mean vector is (almost) zero the addresses surround the globe evenly and there is no single middle; the app says so instead of inventing one. The geometric median uses Weiszfeld iteration on the sphere, and the minimax centre uses a Bădoiu–Clarkson style iteration toward the farthest point. See [`src/geo.js`](src/geo.js) and the tests in [`test/`](test/).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # geometry tests
npm run build        # static site in dist/
npm run build:single # one self-contained dist/meeting-point.html you can open from disk
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. In the repository settings, under **Pages**, set the source to **GitHub Actions** once.

## Stack

Vite, React, Leaflet with CARTO/OpenStreetMap tiles, Photon geocoding. No backend.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles by [CARTO](https://carto.com/attributions).

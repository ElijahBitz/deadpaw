# deadpaw <img src="/public/icon/icon.png" width="30" alt="icon" />

Quickly turn any pet picture into your favorite **Deadlock** heroes.

A fork of **[pawverwatch](https://github.com/ThaiDuongVu/pawverwatch)** by [@wingnight_ow](https://www.tiktok.com/@wingnight_ow), with the Overwatch roster swapped for Deadlock's.

## Guide 💻

1. Upload a base pet image
2. (Optional) Remove the background from the image
3. Click on a hero, then add the items you want (portraits, head sticker, ability badges, name plate)
4. Edit the added items
5. Download using the export tool

## Features 💡

### Completed ✅

- [x] Image background removal
- [x] Basic image manipulation (move, rotate, scale)
- [x] Advanced image manipulation (flip, reset, duplicate, delete)
- [x] Image layer control
- [x] Hero and city backgrounds
- [x] Hero image items
- [x] Download image
- [x] Save image to favorites
- [x] Dark/light theme

### TODO 🔁

- [ ] Simple drawing
- [ ] Light video editing
- [ ] Alternative skins
- [ ] Manual background removal mode
- [ ] Mobile support (maybe)
- New heroes

## Local build 🔨

**deadpaw <img src="/public/icon/icon.png" width="15" alt="icon" />** is a front-end, serverless application built using **[React <img src="/public/images/readme/react.png" width="15" alt="react" />](https://react.dev/)** and **[Next.js <img src="/public/images/readme/nextjs.png" width="15" alt="next" />](https://nextjs.org/)**. You can run a local version if you have **[Node.js <img src="/public/images/readme/node.png" width="15" alt="node" />](https://nodejs.org/)** (v26.4.0 or newer) installed.

To run **deadpaw <img src="/public/icon/icon.png" width="15" alt="icon" />** locally:

1. Clone the repository `git clone https://github.com/ElijahBitz/deadpaw.git`
2. Move into the cloned folder `cd ./deadpaw/`
3. Download the game art `python3 scripts/fetch-deadlock-assets.py` (needs Python 3 and ImageMagick with SVG support, e.g. `librsvg2-bin`)
4. Install the required dependecies `npm install`
5. Run `npm run dev`
6. You should be able to access the project at **<http://localhost:3000>**

Or with Docker, which downloads the art as part of the image build:

```
docker compose up -d --build
```

## Updating heroes 🔁

Hero art and data come from the community **[Deadlock API](https://deadlock-api.com)**, with renders, weapons, reference sheets, concept art, creatures and district screenshots from the **[Deadlock Wiki](https://deadlock.wiki)** and store screenshots from **Steam**. To pull in newly released heroes, run (needs Python 3 and ImageMagick with SVG support, e.g. `librsvg2-bin`):

```
python3 scripts/fetch-deadlock-assets.py
```

This regenerates `public/images/deadlock/` and `public/data/deadlock/`. These are not kept in the repository (they are Valve's artwork), so the script has to be run once after cloning.

## Syncing with pawverwatch 🔀

To pull in upstream's editor improvements, run:

```
scripts/sync-upstream.sh
```

It merges upstream's code but leaves out its Overwatch heroes, maps and examples, and keeps this fork's own README, home page and branding (see `.gitattributes`). Deadlock art lives in separate `deadlock` folders, so upstream adding characters never collides with it. Use this instead of GitHub's **Sync fork** button, which doesn't know any of that.

## Disclaimer

This is an unofficial, fan-made project. **Deadlock** and all related names, characters, and assets are trademarks of **Valve Corporation**.

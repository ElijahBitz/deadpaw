#!/usr/bin/env python3
"""Regenerate hero/background images and data files from the community Deadlock API
the Deadlock fan wiki and the Steam store.

Requires Python 3.9+ and ImageMagick (`convert`). Run from the repository root:

    python3 scripts/fetch-deadlock-assets.py

With --if-new-heroes it only rebuilds when the API lists a hero the current data lacks
(the container runs this on every start, so new heroes show up without a rebuild).
"""
import hashlib
import json
import re
import shutil
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API = "https://api.deadlock-api.com/v1/assets"
BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/images"
WIKI_API = "https://deadlock.wiki/api.php"
# Wiki file name suffix -> item name
WIKI_IMAGES = {"Render": "fullbody", "Weapon": "weapon"}
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
# Everything generated lives in its own "deadlock" folders, away from the paths upstream pawverwatch
# uses for its Overwatch art, so merging upstream never touches it
IMAGES_LIVE = PUBLIC / "images" / "deadlock"
DATA_LIVE = PUBLIC / "data" / "deadlock"
# Everything is built next to the live folders and swapped in at the end, so a failed run leaves them untouched
IMAGES = IMAGES_LIVE.with_name("deadlock.new")
DATA = DATA_LIVE.with_name("deadlock.new")
CACHE = ROOT / ".asset-cache"

BADGE_FILL = "#1c1917"
GLYPH_FILL = "#f3e9d2"
BACKDROP_FILL = "#14110f"
STICKER_QUALITY = "85"

STEAM_APP_DETAILS = "https://store.steampowered.com/api/appdetails?appids=1422450"
MAX_CONCEPT_ART = 4
WORKERS = int(os.environ.get("ASSET_WORKERS", "8"))

# Wiki screenshots and artwork that work as backgrounds (hand-picked, the categories are mixed)
WIKI_BACKGROUNDS = {
    "Districts": [
        "Archmother base.jpeg", "Hiddenking base.jpeg", "Broadway 01.jpg", "CentralPark green.jpeg",
        "ChinatownDistrict.jpeg", "Downtown blue.jpeg", "Haunted slums 01.jpg", "HauntedLotDistrict.jpeg",
        "OldFairfaxFactories yellow.jpeg", "PlazaDistrict.jpeg", "SeaportDock yellow.jpeg", "Spawnroom blue.jpg",
        "Spawnroom orange.jpg", "Steam vent secret shop.jpg", "StockExchange yellow.jpeg",
        "TheBrownstones green.jpeg", "TheaterDistrict.jpeg", "Times square 05.jpg", "UmbriaUniversity green.jpeg",
        "Uptown blue.jpg",
    ],
    "Art": [
        "Baba Release.png", "Rat King Release.png", "Solomon Release.png", "Call of industry poster.jpg",
        "Somnex poster.jpg", "City buildings.jpg",
    ],
}
# Wiki categories offered as extra sticker groups
WIKI_STICKER_CATEGORIES = {"Creatures": "Haunt renders", "Chalk": "Chalk drawings"}
IMAGE_TYPES = ("image/png", "image/jpeg", "image/webp")

# Standalone backgrounds that are not tied to a hero
CITY_BACKGROUNDS = [
    "main_menu/bg_city.png",
    "main_menu/background_gothic_jpg.jpeg",
    "main_menu/background_nyc_cityscape_bw.png",
]


def fetch(url: str, refresh: bool = False) -> Path:
    """Download a URL into the cache and return the local path.

    Files are downloaded once. With refresh (for API answers, which change when heroes are added)
    it is downloaded again, falling back to the cached copy when that fails."""
    name = re.sub(r"[^A-Za-z0-9._-]", "_", url.split("://", 1)[1])
    if len(name) > 150:
        name = name[:100] + "_" + hashlib.sha1(url.encode()).hexdigest()
    target = CACHE / name
    if refresh or not target.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "deadpaw-asset-fetcher"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read()
        except OSError:
            if not target.exists():
                raise
            print(f"Could not refresh {url}, using the cached copy", file=sys.stderr)
        else:
            partial = target.with_name(target.name + ".part")
            partial.write_bytes(body)
            partial.replace(target)
    return target


def fetch_json(path: str):
    return json.loads(fetch(f"{API}/{path}", refresh=True).read_text())


def local(url: str) -> Path:
    """Where a generated /images/deadlock/... URL is being written during this run."""
    return IMAGES / url.removeprefix("/images/deadlock/")


def wiki_query(**params) -> list:
    query = urllib.parse.urlencode({"action": "query", "prop": "imageinfo", "iiprop": "url|size|mime",
                                    "format": "json", **params})
    pages = json.loads(fetch(f"{WIKI_API}?{query}", refresh=True).read_text()).get("query", {}).get("pages", {})
    return [page for page in pages.values() if page.get("imageinfo")]


def wiki_files(names: list) -> dict:
    """Look up wiki files by name, returns {file name: url} for the ones that exist."""
    urls = {}
    batch_size = 40
    for start in range(0, len(names), batch_size):
        titles = "|".join(f"File:{name}" for name in names[start:start + batch_size])
        for page in wiki_query(titles=titles):
            urls[page["title"].removeprefix("File:")] = page["imageinfo"][0]["url"]
    return urls


def wiki_category(category: str) -> list:
    """Image files in a wiki category as (file name, image info), sorted by name."""
    pages = wiki_query(generator="categorymembers", gcmtitle=f"Category:{category}", gcmtype="file", gcmlimit="500")
    files = [(page["title"].removeprefix("File:"), page["imageinfo"][0]) for page in pages]
    return sorted((name, info) for name, info in files if info["mime"] in IMAGE_TYPES)


def wiki_name(hero_name: str) -> str:
    # The wiki files "The Doorman" under "Doorman"
    return hero_name.removeprefix("The ")


def fetch_wiki_images(hero_names: list) -> dict:
    """Look up the wiki's per-hero image URLs, keyed by (hero name, item name)."""
    wanted = {}
    for name in hero_names:
        for suffix, item in WIKI_IMAGES.items():
            wanted[f"{name} {suffix}.png"] = (name, item)
        wanted[f"{name} Reference Sheet.png"] = (name, "reference")
        wanted[f"{wiki_name(name)} Reference Sheet.png"] = (name, "reference")
    urls = {wanted[file]: url for file, url in wiki_files(list(wanted)).items() if file in wanted}

    for name in hero_names:
        concepts = [info["url"] for file, info in wiki_category(wiki_name(name))
                    if "concept" in file.lower() and wiki_name(name).lower() in file.lower()
                    and min(info["width"], info["height"]) >= 256]
        for index, url in enumerate(concepts[:MAX_CONCEPT_ART], start=1):
            urls[(name, f"concept{index}")] = url
    return urls


def file_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.rsplit(".", 1)[0].lower()).strip("-")


def build_sticker_group(name: str, sources: list) -> dict:
    """An extra, non-hero sticker group from a list of (file name, url)."""
    group_id = slug(name)
    item_dir = IMAGES / "items" / group_id
    item_dir.mkdir(parents=True, exist_ok=True)
    produced = []
    for file, url in sources:
        target = item_dir / f"{file_slug(file)}.png"
        convert(fetch(url), "-resize", "512x512>", target)
        produced.append(f"/images/deadlock/items/{group_id}/{target.name}")
    convert(local(produced[0]), "-background", "none", "-resize", "128x128", "-gravity", "center",
            "-extent", "128x128", IMAGES / "heroes" / f"{group_id}.png")
    return {"name": name, "id": group_id, "img": f"/images/deadlock/heroes/{group_id}.png", "items": produced, "extra": True}


def build_mode(name: str, sources: list) -> dict:
    """A background group from a list of (file name, url)."""
    mode_id = slug(name)
    map_dir = IMAGES / "maps" / mode_id
    map_dir.mkdir(parents=True, exist_ok=True)
    maps = []
    for file, url in sources:
        backdrop(fetch(url), map_dir / f"{file_slug(file)}.webp")
        maps.append(f"/images/deadlock/maps/{mode_id}/{file_slug(file)}.webp")
    thumbnail(local(maps[0]), IMAGES / "modes" / f"{mode_id}.png")
    return {"name": name, "id": f"{mode_id}backdrops", "img": f"/images/deadlock/modes/{mode_id}.png", "maps": maps}


def convert(*args) -> None:
    subprocess.run(["convert", *map(str, args)], check=True)


def has_transparency(image: Path) -> bool:
    out = subprocess.run(["convert", str(image), "-format", "%[fx:mean.a]", "info:"],
                         check=True, capture_output=True, text=True).stdout
    return float(out) < 0.99


def slug(name: str) -> str:
    # Ids double as HTML ids/CSS selectors, so keep letters only
    return re.sub(r"[^a-z]", "", name.lower())


def ability_badge(icon: Path, color: str, out: Path) -> None:
    """Ability icons are white-on-transparent glyphs; put them on a hero-colored badge."""
    glyph = [icon, "-resize", "150x150"]
    if has_transparency(icon):
        glyph += ["-alpha", "extract", "-background", GLYPH_FILL, "-alpha", "shape"]
    convert("-size", "256x256", "xc:none", "-fill", BADGE_FILL, "-stroke", color, "-strokewidth", "10",
            "-draw", "circle 128,128 128,10", "(", *glyph, ")", "-gravity", "center", "-composite", out)


def name_plate(svg: Path, color: str, out: Path) -> None:
    # ImageMagick's SVG renderer draws nothing when the artwork sits inside a clip path
    unclipped = svg.with_suffix(".unclipped.svg")
    unclipped.write_text(re.sub(r' clip-path="[^"]*"', "", svg.read_text()))
    convert("-background", "none", "-density", "150", unclipped, "-resize", "800x",
            "-alpha", "extract", "-background", color, "-alpha", "shape", out)


def backdrop(image: Path, out: Path) -> None:
    convert(image, "-background", BACKDROP_FILL, "-flatten", "-resize", "1920x1920>", "-quality", "82", out)


def large_sticker(image: Path, size: int, out: Path) -> None:
    # The big renders are served as they are, so they're kept small as WebP (which keeps transparency)
    convert(image, "-resize", f"{size}x{size}>", "-quality", STICKER_QUALITY, out)


def thumbnail(image: Path, out: Path) -> None:
    convert(image, "-resize", "80x80^", "-gravity", "center", "-extent", "80x80", out)


def build_hero(hero: dict, items: dict, wiki_images: dict) -> dict:
    hero_id = slug(hero["name"])
    images = hero["images"]
    color = "rgb({},{},{})".format(*hero["colors"]["ui"])
    item_dir = IMAGES / "items" / hero_id
    item_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy(fetch(images["icon_image_small"]), IMAGES / "heroes" / f"{hero_id}.png")

    produced = []
    for name, key in [("card", "icon_hero_card"), ("gloat", "hero_card_gloat"),
                      ("critical", "hero_card_critical"), ("head", "icon_image_small")]:
        if images.get(key):
            shutil.copy(fetch(images[key]), item_dir / f"{name}.png")
            produced.append(f"{name}.png")
    if (hero["name"], "fullbody") in wiki_images:
        large_sticker(fetch(wiki_images[(hero["name"], "fullbody")]), 1024, item_dir / "fullbody.webp")
        produced.append("fullbody.webp")
    if (hero["name"], "weapon") in wiki_images:
        convert(fetch(wiki_images[(hero["name"], "weapon")]), "-trim", "+repage", item_dir / "weapon.png")
        produced.append("weapon.png")
    if (hero["name"], "reference") in wiki_images:
        large_sticker(fetch(wiki_images[(hero["name"], "reference")]), 1400, item_dir / "reference.webp")
        produced.append("reference.webp")
    for index in range(1, MAX_CONCEPT_ART + 1):
        if (hero["name"], f"concept{index}") in wiki_images:
            large_sticker(fetch(wiki_images[(hero["name"], f"concept{index}")]), 1024,
                          item_dir / f"concept{index}.webp")
            produced.append(f"concept{index}.webp")
    for index in range(1, 5):
        ability = items.get(hero["items"].get(f"signature{index}"))
        if ability and ability.get("image"):
            ability_badge(fetch(ability["image"]), color, item_dir / f"ability{index}.png")
            produced.append(f"ability{index}.png")
    if images.get("name_image"):
        name_plate(fetch(images["name_image"]), color, item_dir / "name.png")
        produced.append("name.png")

    background = None
    if images.get("background_image_webp"):
        background = f"/images/deadlock/maps/heroes/{hero_id}.webp"
        backdrop(fetch(images["background_image_webp"]), local(background))

    return {
        "name": hero["name"],
        "id": hero_id,
        "img": f"/images/deadlock/heroes/{hero_id}.png",
        "items": [f"/images/deadlock/items/{hero_id}/{name}" for name in produced],
        "background": background,
    }


def missing_heroes(heroes: list) -> list:
    """Names of heroes the API lists that the live data doesn't have yet."""
    try:
        current = json.loads((DATA_LIVE / "heroes.json").read_text())
    except (OSError, ValueError):
        return [hero["name"] for hero in heroes]
    known = {hero["name"] for hero in current if not hero.get("extra")}
    return [hero["name"] for hero in heroes if hero["name"] not in known]


def swap_in(staged: Path, live: Path) -> None:
    # Deleted rather than renamed aside: in a container, folders that came with the image can't be renamed
    shutil.rmtree(live, ignore_errors=True)
    staged.rename(live)


def main() -> None:
    CACHE.mkdir(exist_ok=True)
    heroes = sorted((h for h in fetch_json("heroes") if h["player_selectable"]), key=lambda h: h["name"])
    if "--if-new-heroes" in sys.argv:
        new = missing_heroes(heroes)
        if not new:
            print(f"All {len(heroes)} heroes already have assets")
            return
        print(f"New heroes: {', '.join(new)}, rebuilding assets")

    for staged in [IMAGES, DATA]:
        shutil.rmtree(staged, ignore_errors=True)
    for directory in ["heroes", "items", "maps/heroes", "modes"]:
        (IMAGES / directory).mkdir(parents=True)
    DATA.mkdir(parents=True)

    items = {item["class_name"]: item for item in fetch_json("items")}

    wiki_images = fetch_wiki_images([hero["name"] for hero in heroes])

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        built = list(pool.map(lambda hero: build_hero(hero, items, wiki_images), heroes))

    # Extra sticker groups: shop items and event stickers (Deadlock API), creatures and chalk doodles (wiki)
    extras = []
    for slot in ["weapon", "vitality", "spirit"]:
        shop_items = sorted((item for item in items.values() if item.get("shopable") and item.get("shop_image")
                             and item.get("item_slot_type") == slot), key=lambda item: (item["item_tier"], item["name"]))
        extras.append(build_sticker_group(f"{slot.capitalize()} items",
                                          [(item["name"], item["shop_image"]) for item in shop_items]))
    event_stickers = {file: url for event in fetch_json("images").get("events", {}).values() if isinstance(event, dict)
                      for file, url in event.items() if file.startswith("sticker_") and file.endswith(".png")}
    if event_stickers:
        extras.append(build_sticker_group("Vote stickers", sorted(event_stickers.items())))
    for name, category in WIKI_STICKER_CATEGORIES.items():
        extras.append(build_sticker_group(name, [(file, info["url"]) for file, info in wiki_category(category)]))

    hero_backgrounds = [(hero["name"], hero.pop("background")) for hero in built]
    hero_maps = [background for _, background in hero_backgrounds if background]
    hero_labels = [name for name, background in hero_backgrounds if background]
    thumbnail(local(hero_maps[0]), IMAGES / "modes" / "hero.png")
    modes = [
        {"name": "Hero", "id": "herobackdrops", "img": "/images/deadlock/modes/hero.png", "maps": hero_maps,
         "labels": hero_labels},
        build_mode("City", [(path.split("/")[-1].replace("_jpg", ""), f"{BUCKET}/{path}") for path in CITY_BACKGROUNDS]),
    ]
    for name, files in WIKI_BACKGROUNDS.items():
        urls = wiki_files(files)
        modes.append(build_mode(name, [(file, urls[file]) for file in files if file in urls]))
    screenshots = json.loads(fetch(STEAM_APP_DETAILS, refresh=True).read_text())["1422450"]["data"]["screenshots"]
    modes.append(build_mode("Steam", [(f"steam-{shot['id']}", shot["path_full"]) for shot in screenshots]))

    (DATA / "heroes.json").write_text(json.dumps(built + extras, indent=2, ensure_ascii=False) + "\n")
    (DATA / "modes.json").write_text(json.dumps(modes, indent=2) + "\n")
    swap_in(IMAGES, IMAGES_LIVE)
    swap_in(DATA, DATA_LIVE)
    print(f"{len(built)} heroes with {sum(len(h['items']) for h in built)} stickers, "
          f"{len(extras)} extra groups with {sum(len(e['items']) for e in extras)} stickers, "
          f"{sum(len(m['maps']) for m in modes)} backgrounds in {len(modes)} groups")


if __name__ == "__main__":
    main()

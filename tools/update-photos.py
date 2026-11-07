"""Refresh the site's photo lists from the club's public Google Drive folders.

Run this after adding or removing photos in either folder:

    python tools/update-photos.py

It reads each folder's public listing and rewrites assets/js/photos.js with every image's
Drive ID (videos are skipped). Photos in subfolders (any depth) are included too: the
folder's own photos come first, then each subfolder's in Drive's listing order. Both
folders must be shared as "Anyone with the link -> Viewer" (subfolders inherit that).

For the Gallery page it also groups similar shots into "collections" (one tile each,
with the similar shots inside), using the CLIP image-recognition model so a collection
is one moment or activity. Needs: pip install pillow numpy scipy open_clip_torch
Per-photo features are cached in tools/.photo-cache.json, so reruns only analyse new photos.
"""
import concurrent.futures
import pathlib
import datetime
import html
import io
import json
import re
import sys
import urllib.request

# Paste the shared folder links here.
FOLDERS = {
    # The 20-30 favourites shown in the home-page slideshow.
    "home": "https://drive.google.com/drive/folders/1AsU9HAFkrSXT7cp5UNkjjno0jdINid_B?usp=sharing",
    # Everything, shown on the Gallery page.
    "gallery": "https://drive.google.com/drive/folders/1AsU9HAFkrSXT7cp5UNkjjno0jdINid_B?usp=sharing",
}
# Hand-picked front-page photos (Drive file IDs): 12 older picks alternating with 13 from
# Big One/Hike, in slideshow order. While this list has IDs, the home
# slideshow uses exactly these; empty it to use the "home" folder instead.
HOME_PICKS = [
    "1uNAjK2biGJz50iGc55AELZlrCsjtFexu",
    "1uxJabuVZ9vBs-uJFw8IILBlCbvf2GXyp",
    "1HoD2VlwGCiCyhsARq8HuSVgcBathaWgf",
    "1HVdd75PpLhpNFCPMUUOAxOXP1eybk7jP",
    "1tNSrNM5hxqAe4O0nPamMf4faY26UBLIl",
    "1Uw7z828stJPT3UqApA0WdceOAJacYWiA",
    "1vzUr5sxxq9Yd90YowXf1j1hThZ8nOxT5",
    "1eI0zc3XO12M-_q57IoM2YHV7Eqkm4h3H",
    "1RyErPTvLXRivzPNhK3F0a0mA4i3MjvKm",
    "1_s5AEF-BkRu7eA2zDAQtriPEZwYFAQbD",
    "1tmNueqYMcCXg71fHvEV8A0UBL5_erh1t",
    "1eIeVIuuGgTDPIcl57vNaA1DtUFT9qnmi",
    "1NhzNBfotaiFFNy-9uPrNs2pcx7e3255-",
    "1P30xR1WVLPTKO1zvyX_tDvittnMz7AGS",
    "1L9oJ6nCFRuM8LVLzt4wDrHPgU2BKKX7n",
    "1323_qwYlO-9YHih8vd_MIExsHnU1UXsd",
    "1WeYvTPg2uPecUpaDwi-xhyXnprJQMDDx",
    "1wuJwYBZsHRc96vgO6EXju0TWPn2f9d1u",
    "1pbetpKT6Ogdgyvg5fjW-ywDaZ_h8tkyv",
    "1PfHwUz6d6wONHLqWeMx9SYg1hPOslYkZ",
    "116Jy_ewyK9fMxGP8YJ1adfWezHilNodK",
    "1TJZaOGO3IO4Tp-KEvXAzktcgfFxfVGc0",
    "1AnyrpwTdvRRIk9M8l3NQP9Y1VcjAW507",
    "1gdL-rrA6KhTN74-jUTdjtQ1cWh2sr5QX",
    "1gKI18c5br4Rw0rZO5H3-Bvz4z9KPRXbD",
]
# Optional framing for the slideshow crop ("x% y%"). Default: centre for wide photos,
# upper portion (50% 20%) for tall ones.
HOME_FOCUS = {
    "1EbVN7pdt9cVgnNz324WLZBxO31or-Oir": "75% 40%",  # two teammates talking
    "1BEYOVwVEfWS-uwsxrLGd5UyYXR-F0maq": "60% 50%",  # fencer on the right
    "1uNAjK2biGJz50iGc55AELZlrCsjtFexu": "50% 38%",  # tall: fencer lying on the strip
}

# Gallery collections to always show as big tiles (any photo ID from the collection).
FEATURED = [
    "1NhzNBfotaiFFNy-9uPrNs2pcx7e3255-",
]

# Manual splits for the Gallery: each entry splits one collection into the listed
# parts (photo IDs), kept together in that order where the collection was.
SPLITS = [
    [
        ["1NtRtb90vjZ8DFvFDnAD8LC5K-yicxnCw", "1snwDOIQkOzIOREJA-eQr5CP76sdtSPty", "1OO2zNkAArM7I5P5ltZDayFKoXor1faPf"],
        ["1_m9IlW0s1TRfaxxq8GDbkT5pH7-u0S4N"],
        ["1uTw-_1UE3fN42ky0PJ2Q4OQ-cbfAfVPo", "16Ej6DdodVNvvn9ALQgwGXHzWaIUbd7ZW", "18sMSRqD0FASxmzjFYdeVRxWbWV-FCk6Q", "19BpdunZYAlx4EoegF2O7sNVv-o2fI6Cz", "1wcPfS7FoFTJnxYc8eS-VJqrpBZa-tZfk", "1qeOmnUB0qbEJckbvgmzaWsdeSNNs6IWN", "1jrVd5tcWiTDHBI_nV2QVZCMA_qYc_CLT", "1Fq3Tx_CeOoixdX_6QYpPqGKajW8FZbdE"],
    ],
]

# Manual merges for the Gallery: each entry lists photo IDs (any photo from each
# collection) whose collections should be combined into one. Stored by photo ID,
# so merges survive reruns and renumbering.
MERGES = [
    ["1sgPu-QG_mjyTbf6VurfJ8gwDrWTC_XMz", "1sFTPgLwJuhHE7vhK6mIO_Lq2pxVKsLmA"],
    ["1weXhxtM2jIy1o87iBJ4fzgRR4TPu47pB", "1O5ZHsqO1iphgkYYlCQK6Tq33RnIiPjZm"],
    ["1aMDCtRNh-2i--dekiyAGUBMTWrKuz-J0", "1GGWeiVAVnyUZdDDTTvk2U62y-HGtV9M0", "1ALXcFlKfffPRYYqqVqv2zIZCbfOuVWh5", "1zzjm_lYi-OSoTRxxWFGu4lPZsxIPM-9m", "19P0fmd_HszGIb78EYl5kRWNT1zpHNeYC", "1ehWFIrJGTGtgjd4RWs8yVMxs6-R6pwn1"],
    ["1KXggUiLRAvhXuDskFFprIvgfVTO1iyXk", "1YZg1vbe6n0RjU3aFktMWETyNQ3w5769A", "1MoNxy5uupg4mvFOwUaYZMv_TLgPBtf0O", "1GF1IfZHtRzb6Gj0QPDPLP50ewVEl6oeF", "1otyiC5Mo-gZvNklIhZ8oUa3MsvZNBs7M", "1yhIf75QoUdBrnMxjr0xBxnWCQM8swowK"],
    ["1K8LTgWcEUhydnydA2rqQoSnzAHjiBK1f", "1O3isLzrvztvp5FhZKYWYlWi1qJsNX-Nz"],
    ["10_xtKRU_o1w4wZ3s5v396_TicTQXBx0q", "1YBsnyMvHLnWl_5TMMKNXzz-FfgonOpkY"],
    ["1OF2yqbc7JPBhoCfUqVT5cTiD7diMz77u", "1dQgepJpyp3wtXjPGEBHkozgPFBQn_Rlx", "1YxujRkWbLOPKN65OhOKNHkTea5mEqKG8", "19VfEHKzpKazOaqz-tB4OeAEKZg7hddTS"],
    ["1By-AJOU-k-3jqljoB9tkV6E3gUQyzrpQ", "1QNaBlT2L2gInhi_v7PThzCITPjQH_G1b", "1M5qfwGd0y_lpaIvVZG4eJu1n2ybPpjsh"],
    ["1dqQ4q0dYnAyNypu0eMbSdqbsq8rJzDF8", "1_rpy3vz6zKo83qvxeYF9ndC-7Cw8jzDd"],
    ["1wIVR6WbaJ4Qw4YrXMqs1x3XkQyeCLEU0", "17rQii5814yTxq0XE0CpZp05rFNiH1c4N"],
    ["1wgX9avDktgehJU-KKYBw2o1o0NoEusyI", "1JNU1LNqg0xk3NrA-rGV0aXCOngMfFb_K", "1BEYOVwVEfWS-uwsxrLGd5UyYXR-F0maq"],
    ["18jDZYLt4qM6ZB3mrQnpTe8bAQS9vt9iG", "1pOUEnhBZo6NDsLclQStCp2b6Dew1F4wh", "1RbeKunvLFY3kamMih9Paw-3OJPeE241e"],
    ["1yuULXj3XT_VqGRtMN2r6r9cmuecPUfeF", "1lM9eorWw0C_Rn1gu1ZuytVaO1syStu82", "1FgZazAzFNMpMd3fmS6hiOMB_uiqxhG5z"],
    ["1P8-lMrfUJQCXtHu4L1Splwl9f9vAokHt", "1NP68KQ6XaG3J3pEBGGqXv1Y9hXECwc2j"],
    ["1K3y0DzXVWGGnUImM5qAhWNxZY4EY-FhN", "1PCwf4SA3xKxB3pC4ABswgqsFbADyijZH"],
]
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic", "gif"}
NEWEST_FIRST = True        # Gallery shows the most recently added collections first
# Subfolders oldest first (the newest end up first in the Gallery), matched by a word in
# the folder name (case doesn't matter). Subfolders that match nothing here count as
# newer than all of these, in Drive's listing order.
SUBFOLDER_ORDER = [
    "TOURNAMENT",
    "FUN",
    "HIKE",
    "BIG ONE",
]
# Gallery grouping uses CLIP, an image-recognition model, so collections follow what a
# photo shows (a bout, a salute, a group pose, a summit view), not just its colours.
# Distance between two photos = CLIP difference + COLOUR_WEIGHT x colour difference
# + TIME_WEIGHT x how far apart they are in the folder (full penalty at TIME_SPAN photos).
GROUP_CUTOFF = 0.27         # lower = more, tighter collections
COLOUR_WEIGHT = 0.3
TIME_WEIGHT = 0.15
TIME_SPAN = 40
SAME_SHOT = 0.94            # photos at least this alike (CLIP) always share a collection...
MAX_SPREAD = 0.35           # ...unless that would put photos this different together
CLIP_MODEL = ("ViT-B-16", "datacomp_xl_s13b_b90k")
CACHE = pathlib.Path(__file__).resolve().parent / ".photo-cache.json"  # per-photo features (not committed)
# Saved by the gallery editor (python tools/gallery-editor.py): collection order and
# contents, "always big" tiles, front-page photos and rotations. Once it exists it replaces the
# automatic layout, MERGES, SPLITS, FEATURED and HOME_PICKS for the photos it lists.
LAYOUT = pathlib.Path(__file__).resolve().parent / "gallery-layout.json"


def fetch(url, timeout=30):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(request, timeout=timeout).read()


def list_folder(folder_id, seen, name="main folder"):
    """Photo IDs in one folder, then in each subfolder (and theirs), as lists per folder."""
    if folder_id in seen:
        return []
    seen.add(folder_id)
    try:
        page = fetch(f"https://drive.google.com/embeddedfolderview?id={folder_id}").decode("utf-8")
    except Exception as error:
        sys.exit(f"Could not read folder {folder_id} ({error}). Is it shared as 'Anyone with the link'?")
    entries = re.findall(
        r'<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)".*?<a href="([^"]+)".*?flip-entry-title">([^<]*)<',
        page, re.S)
    ids = [file_id for file_id, link, name in entries
           if "/file/d/" in link and html.unescape(name).rsplit(".", 1)[-1].lower() in IMAGE_EXTENSIONS]
    lists = [(name, ids)] if ids else []
    folders = [(file_id, html.unescape(name)) for file_id, link, name in entries if "/folders/" in link]
    def rank(folder):
        hits = [k for k, word in enumerate(SUBFOLDER_ORDER) if word.lower() in folder[1].lower()]
        return hits[0] if hits else len(SUBFOLDER_ORDER)

    folders.sort(key=rank)
    for file_id, sub_name in folders:
        sub = list_folder(file_id, seen, sub_name)
        if sub:
            print(f"  subfolder {sub_name!r}: {sum(len(i) for _, i in sub)} photos")
        lists += sub
    return lists


def list_photos(folder_url):
    """Every photo in the folder and its subfolders, the index where each folder starts,
    and [folder name, photo count] per folder."""
    folder_id = re.search(r"/folders/([A-Za-z0-9_-]+)", folder_url).group(1)
    ids, starts, folders = [], set(), []
    for name, folder_ids in list_folder(folder_id, set()):
        starts.add(len(ids))
        fresh = [i for i in folder_ids if i not in ids]
        ids += fresh
        folders.append([name, len(fresh)])
    if not ids:
        sys.exit(f"No photos found in {folder_url}. Check the link and its sharing settings.")
    return ids, starts, folders


def photo_features(ids):
    """CLIP embedding, tiny colour thumbnail and sharpness per photo, cached in CACHE."""
    try:
        import numpy as np
        import open_clip
        import torch
        from PIL import Image, ImageFilter, ImageOps, ImageStat
    except ImportError as error:
        sys.exit(f"Missing {error.name}. Grouping needs: pip install pillow numpy scipy open_clip_torch")

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    cache = cache if cache.get("model") == list(CLIP_MODEL) else {"model": list(CLIP_MODEL)}
    todo = [i for i in ids if i not in cache]

    def load(file_id):
        for _ in range(4):
            try:
                image = Image.open(io.BytesIO(fetch(f"https://lh3.googleusercontent.com/d/{file_id}=w400")))
                return ImageOps.exif_transpose(image).convert("RGB")
            except Exception:
                continue
        return None

    if todo:
        print(f"  analysing {len(todo)} new photos (first run downloads the CLIP model)...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            images = list(pool.map(load, todo))
        model, _, preprocess = open_clip.create_model_and_transforms(CLIP_MODEL[0], pretrained=CLIP_MODEL[1])
        model.eval()
        for k in range(0, len(todo), 32):
            batch = [(i, im) for i, im in zip(todo[k:k + 32], images[k:k + 32]) if im is not None]
            if not batch:
                continue
            with torch.no_grad():
                emb = model.encode_image(torch.stack([preprocess(im) for _, im in batch]))
            emb = (emb / emb.norm(dim=-1, keepdim=True)).tolist()
            for (file_id, image), e in zip(batch, emb):
                cache[file_id] = {
                    "clip": [round(x, 5) for x in e],
                    "colour": list(image.resize((24, 18)).tobytes()),
                    "sharp": ImageStat.Stat(image.convert("L").filter(ImageFilter.FIND_EDGES)).var[0],
                }
        CACHE.write_text(json.dumps(cache))
    missing = [i for i in ids if i not in cache]
    if missing:
        print(f"  note: couldn't load {len(missing)} photos; each gets its own collection")
    return cache, np


def group_folder(ids, cache, np):
    """Cluster one folder's photos by content (average linkage), keeping folder order."""
    from scipy.cluster.hierarchy import fcluster, linkage
    from scipy.spatial.distance import squareform

    known = [k for k, i in enumerate(ids) if i in cache]
    singles = [[k] for k, i in enumerate(ids) if i not in cache]
    groups = []
    if len(known) == 1:
        groups = [known]
    elif known:
        E = np.array([cache[ids[k]]["clip"] for k in known])
        C = np.array([cache[ids[k]]["colour"] for k in known], dtype=float)
        pos = np.array(known, dtype=float)
        clip_d = 1 - E @ E.T
        colour_d = np.abs(C[:, None, :] - C[None, :, :]).mean(-1) / 255
        time_d = np.minimum(np.abs(pos[:, None] - pos[None, :]) / TIME_SPAN, 1)
        D = clip_d + COLOUR_WEIGHT * colour_d + TIME_WEIGHT * time_d
        np.fill_diagonal(D, 0)
        labels = fcluster(linkage(squareform(D, checks=False), "average"), GROUP_CUTOFF, "distance")
        label_of = list(labels)
        # Near-identical shots always share a collection, unless that mixes very different photos.
        for a, b in zip(*np.where(np.triu(clip_d <= 1 - SAME_SHOT, 1))):
            la, lb = label_of[a], label_of[b]
            if la == lb:
                continue
            members = [k for k, l in enumerate(label_of) if l in (la, lb)]
            if clip_d[np.ix_(members, members)].max() <= MAX_SPREAD:
                label_of = [la if l == lb else l for l in label_of]
        by_label = {}
        for k, label in zip(known, label_of):
            by_label.setdefault(label, []).append(k)
        groups = list(by_label.values())
    groups = sorted(groups + singles, key=min)  # collections in folder order
    # Put the sharpest shot first; it becomes the group's cover photo.
    sharp = lambda k: -cache[ids[k]]["sharp"] if ids[k] in cache else 0
    return [[ids[k] for k in sorted(g, key=sharp)] for g in groups]


data = {"updated": datetime.date.today().isoformat()}
gallery_starts = set()
for key, url in FOLDERS.items():
    if key == "home" and HOME_PICKS:
        ids = HOME_PICKS[:]
    else:
        ids, starts, folders = list_photos(url)
        if key == "gallery":
            gallery_starts = starts
    data[key] = {"folderUrl": url, "ids": ids}
    if key == "gallery":
        data[key]["folders"] = folders  # [name, photo count] in the same order as ids
    if key == "home":
        data[key]["focus"] = {i: HOME_FOCUS[i] for i in ids if i in HOME_FOCUS}
    print(f"{key}: {len(ids)} photos")


def group_by_folder(ids, starts):
    """Group each folder on its own, so a collection never spans two folders."""
    cache, np = photo_features(ids)
    bounds = sorted(starts | {0}) + [len(ids)]
    groups = []
    for a, b in zip(bounds, bounds[1:]):
        if a < b:
            groups += group_folder(ids[a:b], cache, np)
    return groups


data["gallery"]["groups"] = group_by_folder(data["gallery"]["ids"], gallery_starts)


def apply_merges(groups):
    """Combine collections listed in MERGES; the merged one sits where its earliest part was."""
    for merge in MERGES:
        hits = sorted({k for k, group in enumerate(groups) if set(group) & set(merge)})
        if len(hits) < 2:
            continue
        combined = [photo for k in hits for photo in groups[k]]
        first = hits[0]
        groups = [g for k, g in enumerate(groups) if k not in hits[1:]]
        groups[first] = combined
    return groups


data["gallery"]["groups"] = apply_merges(data["gallery"]["groups"])
if NEWEST_FIRST:
    data["gallery"]["groups"].reverse()  # the Drive folder lists photos oldest first


def apply_splits(groups):
    """Replace a collection with the parts listed in SPLITS (photos not listed stay in the last part)."""
    for parts in SPLITS:
        listed = {photo for part in parts for photo in part}
        hit = next((k for k, group in enumerate(groups) if set(group) & listed), None)
        if hit is None:
            continue
        leftover = [photo for photo in groups[hit] if photo not in listed]
        present = set(groups[hit])
        new_parts = [[photo for photo in part if photo in present] for part in parts]
        new_parts[-1] += leftover
        groups[hit:hit + 1] = [part for part in new_parts if part]
    return groups


data["gallery"]["groups"] = apply_splits(data["gallery"]["groups"])
all_gallery = set(data["gallery"]["ids"])
data["gallery"]["featured"] = [photo for photo in FEATURED if photo in all_gallery]
data["gallery"]["autoBig"] = True  # every 10th tile big, plus featured
data["rotate"] = {}


def apply_layout(layout):
    """Use the arrangement saved by the gallery editor (tools/gallery-editor.py). Photos
    no longer in Drive drop out; photos the layout hasn't seen yet keep their automatic
    collections and go first (they're the newest)."""
    placed, kept = set(), []
    for collection in layout.get("collections", []):
        photos = [p for p in collection["photos"] if p in all_gallery and p not in placed]
        if photos:
            kept.append((photos, collection.get("big", False)))
            placed.update(photos)
    new = [[p for p in group if p not in placed] for group in data["gallery"]["groups"]]
    collections = [(group, False) for group in new if group] + kept
    if len(collections) > len(kept):
        print(f"  {len(collections) - len(kept)} new collections added at the top of the saved layout")
    data["gallery"]["groups"] = [photos for photos, _ in collections]
    data["gallery"]["featured"] = [photos[0] for photos, big in collections if big]  # "always big"
    data["rotate"] = {p: r for p, r in layout.get("rotate", {}).items() if r in (90, 180, 270)}
    if layout.get("home"):
        data["home"]["ids"] = layout["home"]
        data["home"]["focus"] = {i: HOME_FOCUS[i] for i in layout["home"] if i in HOME_FOCUS}


if LAYOUT.exists():
    apply_layout(json.loads(LAYOUT.read_text(encoding="utf-8")))
    print("applied the saved gallery layout (tools/gallery-layout.json)")
print(f"gallery: {len(data['gallery']['groups'])} collections")

OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "js" / "photos.js"
with open(OUTPUT, "w", encoding="utf-8", newline="\n") as file:
    file.write("// Generated by update-photos.py — do not edit by hand. Rerun tools/update-photos.py after changing the Drive folders.\n")
    file.write("window.CLUB_PHOTOS = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("photos.js updated.")

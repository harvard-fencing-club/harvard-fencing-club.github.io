"""Refresh the site's photo lists from the club's public Google Drive folders.

Run this after adding or removing photos in either folder:

    python tools/update-photos.py

It reads each folder's public listing and rewrites assets/js/photos.js with every image's
Drive ID (videos are skipped). Both folders must be shared as
"Anyone with the link -> Viewer".

For the Gallery page it also groups bursts of similar-looking shots together, so
visitors browse ~80-110 "collections" and can open the similar shots in each one.
Grouping needs Pillow (`pip install pillow`); without it every photo stands alone.
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
# Hand-picked front-page photos (Drive file IDs). While this list has IDs, the home
# slideshow uses exactly these; empty it to use the "home" folder instead.
HOME_PICKS = [
    "1uNAjK2biGJz50iGc55AELZlrCsjtFexu",
    "1cVPUsx_StoNWi3T8z0M8QdASEkGf3lwq",
    "1nC7aQkbd44ZkyghNryxsWmEKHiHGgN92",
    "15THr_xHuBN7XVU_Es8eLow3V_zWNq--l",
    "1HoD2VlwGCiCyhsARq8HuSVgcBathaWgf",
    "1tNSrNM5hxqAe4O0nPamMf4faY26UBLIl",
    "1vzUr5sxxq9Yd90YowXf1j1hThZ8nOxT5",
    "1IQo48v8QRMSJLjla_EHsyq5GbKJAYtWA",
    "1RyErPTvLXRivzPNhK3F0a0mA4i3MjvKm",
    "1tmNueqYMcCXg71fHvEV8A0UBL5_erh1t",
    "1NhzNBfotaiFFNy-9uPrNs2pcx7e3255-",
    "1L9oJ6nCFRuM8LVLzt4wDrHPgU2BKKX7n",
    "1WeYvTPg2uPecUpaDwi-xhyXnprJQMDDx",
    "1pbetpKT6Ogdgyvg5fjW-ywDaZ_h8tkyv",
    "1Pbq_Pj-hQjpnfUZQi2PnLKPoCiXRHutG",
    "1snwDOIQkOzIOREJA-eQr5CP76sdtSPty",
    "1_m9IlW0s1TRfaxxq8GDbkT5pH7-u0S4N",
    "116Jy_ewyK9fMxGP8YJ1adfWezHilNodK",
    "1AnyrpwTdvRRIk9M8l3NQP9Y1VcjAW507",
    "1Y141_aDadYoRcpJCSmA4npSVtLFTbARV",
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
TARGET_GROUPS = 95          # aim for roughly this many gallery "collections"
GROUP_RANGE = (80, 110)     # acceptable range


def fetch(url, timeout=30):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(request, timeout=timeout).read()


def list_photos(folder_url):
    folder_id = re.search(r"/folders/([A-Za-z0-9_-]+)", folder_url).group(1)
    try:
        page = fetch(f"https://drive.google.com/embeddedfolderview?id={folder_id}").decode("utf-8")
    except Exception as error:
        sys.exit(f"Could not read {folder_url} ({error}). Is it shared as 'Anyone with the link'?")
    entries = re.findall(
        r'<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)".*?<a href="([^"]+)".*?flip-entry-title">([^<]*)<',
        page, re.S)
    ids = [file_id for file_id, link, name in entries
           if "/file/d/" in link and html.unescape(name).rsplit(".", 1)[-1].lower() in IMAGE_EXTENSIONS]
    if not ids:
        sys.exit(f"No photos found in {folder_url}. Check the link and its sharing settings.")
    return ids


def group_similar(ids):
    """Group consecutive look-alike shots (photos are listed in the order they were taken)."""
    try:
        from PIL import Image, ImageFilter, ImageStat
    except ImportError:
        print("  (Pillow not installed: skipping similar-photo grouping)")
        return [[i] for i in ids]

    def features(file_id):
        for _ in range(3):
            try:
                image = Image.open(io.BytesIO(fetch(f"https://lh3.googleusercontent.com/d/{file_id}=w160"))).convert("RGB")
                small = image.resize((24, 18))
                sharp = ImageStat.Stat(image.convert("L").filter(ImageFilter.FIND_EDGES)).var[0]
                return small.tobytes(), sharp
            except Exception:
                continue
        return None, 0.0

    print(f"  analysing {len(ids)} photos for similar shots...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        feats = list(pool.map(features, ids))

    def distance(a, b):
        if a is None or b is None:
            return 999.0
        return sum(abs(p - q) for p, q in zip(a, b)) / len(a)

    steps = [distance(feats[i - 1][0], feats[i][0]) for i in range(1, len(ids))]

    def cluster(threshold):
        groups, start = [[0]], 0
        for i in range(1, len(ids)):
            near_prev = steps[i - 1] <= threshold
            near_first = distance(feats[start][0], feats[i][0]) <= threshold * 1.8
            if near_prev and near_first:
                groups[-1].append(i)
            else:
                groups.append([i]); start = i
        return groups

    low, high = 0.0, 120.0
    best = cluster(high)
    for _ in range(40):  # binary search a threshold that gives ~TARGET_GROUPS
        mid = (low + high) / 2
        groups = cluster(mid)
        best = groups if abs(len(groups) - TARGET_GROUPS) < abs(len(best) - TARGET_GROUPS) else best
        if len(groups) > TARGET_GROUPS: low = mid
        else: high = mid
    if not GROUP_RANGE[0] <= len(best) <= GROUP_RANGE[1]:
        print(f"  note: ended with {len(best)} groups")

    # Put the sharpest shot first; it becomes the group's cover photo.
    return [[ids[i] for i in sorted(g, key=lambda i: -feats[i][1])] for g in best]


data = {"updated": datetime.date.today().isoformat()}
for key, url in FOLDERS.items():
    ids = HOME_PICKS[:] if key == "home" and HOME_PICKS else list_photos(url)
    data[key] = {"folderUrl": url, "ids": ids}
    if key == "home":
        data[key]["focus"] = {i: HOME_FOCUS[i] for i in ids if i in HOME_FOCUS}
    print(f"{key}: {len(ids)} photos")
data["gallery"]["groups"] = group_similar(data["gallery"]["ids"])


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
print(f"gallery: {len(data['gallery']['groups'])} groups of similar photos")

OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "js" / "photos.js"
with open(OUTPUT, "w", encoding="utf-8", newline="\n") as file:
    file.write("// Generated by update-photos.py — do not edit by hand. Rerun tools/update-photos.py after changing the Drive folders.\n")
    file.write("window.CLUB_PHOTOS = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("photos.js updated.")

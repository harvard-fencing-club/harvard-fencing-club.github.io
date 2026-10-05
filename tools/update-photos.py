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
    "1SMoZbdfOXq2J6fJpLoSn2S8wQ4hiKrWk",
    "1uNAjK2biGJz50iGc55AELZlrCsjtFexu",
    "1Rg_6yTAkBL3NXSNgm5Ys0k0UlKeTj4Sw",
    "1cVPUsx_StoNWi3T8z0M8QdASEkGf3lwq",
    "19P0fmd_HszGIb78EYl5kRWNT1zpHNeYC",
    "1NBTfSixallUVWHxY6ovwr_7CmFVc_aag",
    "1otyiC5Mo-gZvNklIhZ8oUa3MsvZNBs7M",
    "1nC7aQkbd44ZkyghNryxsWmEKHiHGgN92",
    "1R_86qsXOn7DSoB1Vn15fRL5aUILblXsM",
    "15THr_xHuBN7XVU_Es8eLow3V_zWNq--l",
    "1PCwf4SA3xKxB3pC4ABswgqsFbADyijZH",
    "1lM9eorWw0C_Rn1gu1ZuytVaO1syStu82",
    "1MoNxy5uupg4mvFOwUaYZMv_TLgPBtf0O",
    "1So_jtfITF2CkSgeQSzVyHunYy1Mvhuk3",
    "1HoD2VlwGCiCyhsARq8HuSVgcBathaWgf",
    "1tNSrNM5hxqAe4O0nPamMf4faY26UBLIl",
    "1wIVR6WbaJ4Qw4YrXMqs1x3XkQyeCLEU0",
    "1vzUr5sxxq9Yd90YowXf1j1hThZ8nOxT5",
    "1EbVN7pdt9cVgnNz324WLZBxO31or-Oir",
    "1IQo48v8QRMSJLjla_EHsyq5GbKJAYtWA",
    "1RyErPTvLXRivzPNhK3F0a0mA4i3MjvKm",
    "1wDIMhNFtUeRcuOygfORaiSKkKsLAIJxL",
    "18yqkQ6SVDLrU_Bpq4lFjjZ-gmCWFn26u",
    "1tmNueqYMcCXg71fHvEV8A0UBL5_erh1t",
    "1l1LFjG80Hnpwu60YcS1mTFME0P479877",
]
# Optional framing for the slideshow crop ("x% y%"). Default: centre for wide photos,
# upper portion (50% 20%) for tall ones.
HOME_FOCUS = {
    "1EbVN7pdt9cVgnNz324WLZBxO31or-Oir": "75% 40%",  # two teammates talking
    "1BEYOVwVEfWS-uwsxrLGd5UyYXR-F0maq": "60% 50%",  # fencer on the right
    "1uNAjK2biGJz50iGc55AELZlrCsjtFexu": "50% 38%",  # tall: fencer lying on the strip
}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic", "gif"}
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
print(f"gallery: {len(data['gallery']['groups'])} groups of similar photos")

OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "js" / "photos.js"
with open(OUTPUT, "w", encoding="utf-8", newline="\n") as file:
    file.write("// Generated by update-photos.py — do not edit by hand. Rerun tools/update-photos.py after changing the Drive folders.\n")
    file.write("window.CLUB_PHOTOS = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("photos.js updated.")

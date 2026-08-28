#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Poly Haven のテクスチャを取得して XRIFT 向けに整える。

Poly Haven は全アセット CC0（商用可・再配布可・改変可・クレジット不要）だが、
使う前に https://polyhaven.com/license を実際に確認すること。

  # 候補のサムネイルを並べて見る（名前だけで選ぶと外す）
  python fetch_polyhaven.py thumbs ./textures oak_veneer_01 white_oak_veneer ash_veneer

  # diff / nor_gl / arm の 3 枚を取得
  python fetch_polyhaven.py get ./textures oak_veneer_01 --res 1k
  python fetch_polyhaven.py get ./textures dirty_carpet --res 1k --downscale 512 \
      --desaturate 0.88 --brighten 1.18 --rename carpet_grey

  # 検索
  python fetch_polyhaven.py search wood carpet plaster
"""
import argparse
import io
import json
import os
import sys
import urllib.request

API = "https://api.polyhaven.com"
CDN = "https://cdn.polyhaven.com/asset_img/thumbs/%s.png?width=%d&height=%d"
MAPS = ("diff", "nor_gl", "arm")   # arm = AO(R)/Rough(G)/Metal(B)、glTF 直結の最短ルート


def _get(url, timeout=40):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def _json(url):
    return json.loads(_get(url).decode("utf-8"))


def cmd_search(args):
    d = _json(API + "/assets?type=textures")
    print("%d textures" % len(d))
    for kw in args.keywords:
        hits = sorted(k for k in d if kw.lower() in k.lower())
        print("\n%s (%d)" % (kw.upper(), len(hits)))
        for h in hits[:25]:
            print("   ", h, "|", ", ".join(d[h].get("tags", [])[:6]))


def cmd_thumbs(args):
    os.makedirs(args.out, exist_ok=True)
    paths = []
    for n in args.names:
        p = os.path.join(args.out, "th_%s.png" % n)
        open(p, "wb").write(_get(CDN % (n, 200, 200)))
        paths.append((n, p))
        print("thumb", n)
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("Pillow が無いのでコンタクトシートは作らない")
        return
    S, C = 200, 4
    R = (len(paths) + C - 1) // C
    sheet = Image.new("RGB", (C * S, R * (S + 22)), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, (n, p) in enumerate(paths):
        im = Image.open(p).convert("RGB").resize((S, S))
        x, y = (i % C) * S, (i // C) * (S + 22)
        sheet.paste(im, (x, y))
        d.text((x + 4, y + S + 5), n, fill=(230, 230, 230))
    out = os.path.join(args.out, "contact_sheet.png")
    sheet.save(out)
    print("\n-> %s  (Read で実際に見ること)" % out)


def cmd_get(args):
    os.makedirs(args.out, exist_ok=True)
    files = _json("%s/files/%s" % (API, args.name))
    stem = args.rename or args.name
    suffix = str(args.downscale) if args.downscale else args.res
    written = []

    for m in MAPS:
        if m not in files:
            print("!! %s に %s マップが無い" % (args.name, m))
            continue
        entry = files[m].get(args.res)
        if not entry or "jpg" not in entry:
            print("!! %s/%s に jpg が無い" % (m, args.res))
            continue
        raw = _get(entry["jpg"]["url"])
        dst = os.path.join(args.out, "%s_%s_%s.jpg" % (stem, m, suffix))

        needs_edit = args.downscale or (m == "diff" and (args.desaturate or args.brighten != 1.0))
        if needs_edit:
            from PIL import Image, ImageEnhance
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            if m == "diff" and args.desaturate:
                # 色被り（苔色など）は Multiply では増幅されるだけなので、ここで脱色する
                im = Image.blend(im, im.convert("L").convert("RGB"), args.desaturate)
            if m == "diff" and args.brighten != 1.0:
                im = ImageEnhance.Brightness(im).enhance(args.brighten)
            if args.downscale:
                im = im.resize((args.downscale, args.downscale), Image.LANCZOS)
            im.save(dst, quality=88)
        else:
            open(dst, "wb").write(raw)

        written.append(dst)
        print("%-46s %8d B" % (os.path.basename(dst), os.path.getsize(dst)))

    meta = _json("%s/info/%s" % (API, args.name))
    print("\nauthors: %s" % ", ".join(meta.get("authors", {}).keys()))
    print("license: Poly Haven CC0 -- https://polyhaven.com/license")
    print("pbr_mat(..., asset=%r, res=%r)" % (stem, suffix))
    if args.desaturate or args.brighten != 1.0 or args.downscale:
        print("NOTE: 加工済み（脱色 %s / 明度 %s / %s px）。README に記録すること"
              % (args.desaturate, args.brighten, args.downscale))
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search"); s.add_argument("keywords", nargs="+")
    s.set_defaults(func=cmd_search)

    t = sub.add_parser("thumbs"); t.add_argument("out"); t.add_argument("names", nargs="+")
    t.set_defaults(func=cmd_thumbs)

    g = sub.add_parser("get")
    g.add_argument("out")
    g.add_argument("name")
    g.add_argument("--res", default="1k", choices=["1k", "2k", "4k"])
    g.add_argument("--downscale", type=int, default=None,
                   help="取得後にこの解像度へ縮小（床など高周波なものは 512 で足りる）")
    g.add_argument("--desaturate", type=float, default=None,
                   help="diff の脱色量 0-1。色被りを消す")
    g.add_argument("--brighten", type=float, default=1.0)
    g.add_argument("--rename", default=None)
    g.set_defaults(func=cmd_get)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())

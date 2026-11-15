"""Greyscale brightness stats for look frames (the council's measurable bar): p5 shadows, median, p95 highlights, shade share."""
import sys
from PIL import Image
for path in sys.argv[1:]:
    im = Image.open(path).convert("L").resize((320, 180))
    px = sorted(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()); n = len(px)
    hsv = Image.open(path).convert("HSV").resize((320, 180)); sat = sorted(p[1] for p in (hsv.get_flattened_data() if hasattr(hsv, "get_flattened_data") else hsv.getdata()))
    dark = sum(1 for v in px if v < 45) / n
    rgb = Image.open(path).convert("RGB").resize((320, 180)); clip = sum(1 for p in (rgb.get_flattened_data() if hasattr(rgb, "get_flattened_data") else rgb.getdata()) if max(p) >= 254) / n
    print(f"{path.split('/')[-1]:40s} p5={px[int(n*.05)]:3d} p50={px[n//2]:3d} p95={px[int(n*.95)]:3d} dark<45={dark:.0%} satMed={sat[len(sat)//2]/255:.2f} clip={clip:.1%}")

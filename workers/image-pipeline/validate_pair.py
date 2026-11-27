"""Strict lossless pixel QA. Usage: python validate_pair.py original.webp modified.webp regions.json.
regions.json is an array of {pixelBox:[x0,y0,x1,y1]}; coordinates are half-open."""
import json
import sys
from PIL import Image
import numpy as np

def validate(a,b,regions):
    if a.size != b.size: raise ValueError("size mismatch")
    w,h=a.size
    diff=np.any(np.asarray(a.convert("RGB"))!=np.asarray(b.convert("RGB")),axis=2)
    union=np.zeros((h,w),dtype=bool)
    counts=[]
    for region in regions:
        x0,y0,x1,y1=region["pixelBox"]
        if not (0<=x0<x1<=w and 0<=y0<y1<=h): raise ValueError("invalid box")
        if union[y0:y1,x0:x1].any(): raise ValueError("overlap")
        union[y0:y1,x0:x1]=True
        counts.append(int(diff[y0:y1,x0:x1].sum()))
    outside=int((diff & ~union).sum())
    return {"outsideChanged":outside,"regionChanged":counts,"passed":bool(regions) and outside==0 and all(c>0 for c in counts)}

if __name__=="__main__":
    a,b,manifest=sys.argv[1:]
    with open(manifest,encoding="utf-8") as f: regions=json.load(f)
    r=validate(Image.open(a),Image.open(b),regions)
    print(json.dumps(r))
    sys.exit(0 if r["passed"] else 1)

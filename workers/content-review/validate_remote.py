"""Sanitized receipt for the server inbox worker. No approval is made here."""
import json
import sys
import review

try:
    review.validate_package(review.read_limited(sys.argv[1]))
    print(json.dumps({'passed':True,'message':'이미지·정답 영역·변경 픽셀 일치'}))
except (ValueError,OSError,KeyError,TypeError,review.Image.DecompressionBombError):
    print(json.dumps({'passed':False,'message':'이미지 또는 정답 영역이 검수 요청과 일치하지 않습니다.'}))

import unittest
from PIL import Image
from validate_pair import validate

class QA(unittest.TestCase):
    def test_local_change(self):
        a=Image.new("RGB",(8,8))
        b=a.copy()
        b.putpixel((2,2),(255,0,0))
        self.assertTrue(validate(a,b,[{"pixelBox":[1,1,4,4]}])["passed"])
        self.assertFalse(validate(a,b,[{"pixelBox":[4,4,7,7]}])["passed"])
    def test_overlap(self):
        a=Image.new("RGB",(8,8))
        with self.assertRaises(ValueError):
            validate(a,a,[{"pixelBox":[1,1,4,4]},{"pixelBox":[2,2,5,5]}])
    def test_no_change(self):
        a=Image.new("RGB",(8,8))
        self.assertFalse(validate(a,a,[{"pixelBox":[1,1,4,4]}])["passed"])

if __name__=="__main__": unittest.main()

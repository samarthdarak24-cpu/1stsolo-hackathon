import base64, io, json
from PIL import Image, ImageDraw
img = Image.new("RGB",(480,360),(25,25,28))
d = ImageDraw.Draw(img); d.rectangle([120,90,360,300], fill=(30,30,35)); d.rectangle([150,120,330,200], fill=(200,40,40))
buf = io.BytesIO(); img.save(buf, format="JPEG")
open("t.jpg","wb").write(buf.getvalue())
print("wrote t.jpg", len(buf.getvalue()), "bytes")

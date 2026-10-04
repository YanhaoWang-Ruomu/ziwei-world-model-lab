"""Draw the desktop emblem; no website material or private content is copied."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
image = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((16, 16, 1008, 1008), 215, fill='#081321', outline='#9d8456', width=12)
draw.ellipse((168, 168, 856, 856), outline='#536076', width=5)
draw.ellipse((236, 236, 788, 788), outline='#ab9569', width=5)
for angle in range(0, 360, 45):
    a = math.radians(angle)
    outer = 344 if angle % 90 == 0 else 245
    draw.line((512, 512, 512 + math.cos(a)*outer, 512 + math.sin(a)*outer), fill='#d8c08b', width=13)
draw.polygon([(512, 290), (554, 470), (734, 512), (554, 554), (512, 734), (470, 554), (290, 512), (470, 470)], fill='#e8d5a5')
draw.ellipse((704, 217, 738, 251), fill='#d8c08b')
draw.ellipse((225, 730, 249, 754), fill='#a0c6e2')
(root / 'build').mkdir(exist_ok=True)
image.save(root / 'build/icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
image.resize((256,256), Image.Resampling.LANCZOS).save(root / 'app/icon.png')

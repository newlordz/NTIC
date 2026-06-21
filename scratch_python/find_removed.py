import os

scss_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.scss"

with open(scss_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'removed' in line.lower():
        print(f"Line {idx+1}: {line.strip()}")

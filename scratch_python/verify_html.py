import os

html_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.html"

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

count = content.count("reading-progress")
print(f"Number of occurrences of 'reading-progress' in landing.component.html: {count}")

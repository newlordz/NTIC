import os
import sys

# Ensure UTF-8 printing
sys.stdout.reconfigure(encoding='utf-8')

html_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.html"
ts_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.ts"

def search_file(path, query):
    print(f"\n--- Searching for '{query}' in {os.path.basename(path)} ---")
    if not os.path.exists(path):
        print("File does not exist")
        return
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    found = 0
    for idx, line in enumerate(lines):
        if query.lower() in line.lower():
            # Clean non-ascii if needed, but UTF-8 stdout should handle it
            cleaned_line = line.strip()
            print(f"{idx+1}: {cleaned_line}")
            found += 1
    print(f"Total found: {found}")

search_file(html_path, "stem")
search_file(ts_path, "stem")
search_file(ts_path, "nsc")

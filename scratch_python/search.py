import os

scss_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.scss"
html_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.html"

def search_file(path, query):
    print(f"\n--- Searching for '{query}' in {os.path.basename(path)} ---")
    if not os.path.exists(path):
        print("File does not exist")
        return
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    for idx, line in enumerate(lines):
        if query.lower() in line.lower():
            print(f"{idx+1}: {line.strip()}")

search_file(scss_path, "spotlight")
search_file(scss_path, "progress")
search_file(scss_path, "story")
search_file(scss_path, "card-num")
search_file(html_path, "progress")
search_file(html_path, "story")

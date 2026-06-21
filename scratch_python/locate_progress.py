import re

html_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.html"

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's parse the HTML using regex to find which sections contain reading-progress
# We can find sections by looking for <section or headers, and search for reading-progress inside them.
sections = re.split(r'(<section[^>]*>)', content)
current_section_header = "Pre-section / Header"

for part in sections:
    if part.startswith('<section'):
        # Get section class or id
        match = re.search(r'(class|id)="([^"]+)"', part)
        if match:
            current_section_header = f"Section: {match.group(2)}"
        else:
            current_section_header = part
    else:
        # Check for reading-progress
        progress_matches = re.findall(r'<div class="reading-progress"[^>]*></div>', part)
        if progress_matches:
            # Find the closest preceding h2 or h3 to give context
            sub_matches = re.findall(r'<h[23]>(.*?)</h[23]>', part)
            header_context = sub_matches[-1] if sub_matches else "Unknown Header"
            print(f"[{current_section_header}] (Near: {header_context}) found {len(progress_matches)} progress bar(s):")
            for pm in progress_matches:
                print(f"  {pm}")

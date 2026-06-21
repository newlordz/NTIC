import re
import os

html_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.html"
scss_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.scss"

# 1. Remove from HTML
if os.path.exists(html_path):
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Remove lines containing reading-progress
    lines = html_content.split('\n')
    new_lines = [line for line in lines if 'reading-progress' not in line]
    new_html = '\n'.join(new_lines)
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    print("Removed reading-progress elements from landing.component.html")

# 2. Clean up SCSS
# Let's remove the reading-progress blocks or comment them out
if os.path.exists(scss_path):
    with open(scss_path, 'r', encoding='utf-8') as f:
        scss_content = f.read()
    
    # We can write a simple regex or replacement to remove the reading-progress styles
    # We will search for references to reading-progress and replace them or comment them out
    # Let's do a precise string replacement for the key sections to keep it clean.
    
    # Replace reading-progress transitions
    scss_content = re.sub(r'\.reading-progress\s*\{[^}]*\}', '/* removed reading-progress */', scss_content)
    # Also handle nested blocks or after pseudo-elements
    scss_content = re.sub(r'\.reading-progress\s*\{[^{}]*\{[^{}]*\}[^{}]*\}', '/* removed nested reading-progress */', scss_content)
    
    # Let's remove other occurrences like:
    # .spotlight-card .reading-progress::after { ... }
    # .spotlight-card:nth-child(2) .reading-progress::after { ... }
    # etc.
    scss_content = re.sub(r'\.[a-zA-Z0-9_-]+\s+\.reading-progress::after\s*\{[^}]*\}', '', scss_content)
    scss_content = re.sub(r'\.[a-zA-Z0-9_-]+:nth-child\(\d+\)\s+\.reading-progress::after\s*\{[^}]*\}', '', scss_content)
    
    with open(scss_path, 'w', encoding='utf-8') as f:
        f.write(scss_content)
    print("Cleaned up reading-progress styles from landing.component.scss")

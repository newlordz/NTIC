import os

scss_path = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\app\pages\landing\landing.component.scss"

if os.path.exists(scss_path):
    with open(scss_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We will search for '/* removed reading-progress */\n    }' and replace it with '/* removed reading-progress and brace */'
    # To handle potential variations in line endings on Windows (\r\n vs \n), we use regex
    import re
    fixed_content = re.sub(r'/\* removed reading-progress \*/\r?\n\s*\}', '/* removed reading-progress and brace */', content)
    
    with open(scss_path, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    print("Successfully removed stray braces from landing.component.scss")

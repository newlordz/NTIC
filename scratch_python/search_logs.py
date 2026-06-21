import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

logs_path = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain\f6e5b095-c0ca-4c0c-91f5-84937bfc67fd\.system_generated\logs\transcript.jsonl"

if not os.path.exists(logs_path):
    print("Logs file not found")
    exit(1)

with open(logs_path, 'r', encoding='utf-8', errors='ignore') as f:
    for line_idx, line in enumerate(f):
        if 'spotlight-card' in line:
            # We want to find actual HTML content inside json tool arguments or outputs
            # Let's extract portions of HTML containing spotlight-card
            matches = re.finditer(r'spotlight-card', line)
            for m in matches:
                start = max(0, m.start() - 300)
                end = min(len(line), m.end() + 500)
                snippet = line[start:end]
                # Print matches that look like HTML tags
                if '<div' in snippet or 'class=' in snippet:
                    print(f"Line {line_idx+1} Match:")
                    print(snippet)
                    print("-" * 50)

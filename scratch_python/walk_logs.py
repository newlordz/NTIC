import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain"

found_files = []
for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file == 'transcript.jsonl':
            found_files.append(os.path.join(root, file))

print(f"Found {len(found_files)} transcript files:")
for f in found_files:
    print(f" - {f}")

for path in found_files:
    print(f"\n=================== SEARCHING IN {path} ===================")
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line_idx, line in enumerate(f):
            if 'Inspect card info' in line or 'Get detailed styles' in line or 'Inspect section elements' in line:
                print(f"Line {line_idx+1}:")
                # print a snippet containing the keyword
                idx = line.find('Inspect section elements')
                if idx == -1:
                    idx = line.find('Inspect card info')
                if idx == -1:
                    idx = line.find('Get detailed styles')
                
                # Print around the match
                start = max(0, idx - 100)
                end = min(len(line), idx + 2500)
                print(line[start:end])
                print("-" * 50)

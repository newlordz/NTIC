import os
import sys
import glob
import json

sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain"
search_pattern = os.path.join(brain_dir, "**", "transcript.jsonl")

# Find all transcript.jsonl files under C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain
transcript_files = glob.glob(search_pattern, recursive=True)

print(f"Found {len(transcript_files)} transcript files:")
for f in transcript_files:
    print(f" - {f}")

for path in transcript_files:
    print(f"\n=================== SEARCHING IN {path} ===================")
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line_idx, line in enumerate(f):
            if 'Inspect card info' in line or 'Get detailed styles' in line or 'Inspect section elements' in line:
                try:
                    obj = json.loads(line)
                    # We want to print the response/output
                    print(f"Line {line_idx+1}: type={obj.get('type')}, status={obj.get('status')}")
                    content = obj.get('content') or obj.get('output')
                    if content:
                        print("Content preview:")
                        print(content[:1500])
                    else:
                        print("No content field, printing full object preview:")
                        print(str(obj)[:1000])
                    print("-" * 50)
                except Exception as e:
                    print(f"Line {line_idx+1}: (not strict JSON) {line[:500]}")
                    print("-" * 50)

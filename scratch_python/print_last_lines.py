import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

logs_path = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain\f6e5b095-c0ca-4c0c-91f5-84937bfc67fd\.system_generated\logs\transcript.jsonl"

if not os.path.exists(logs_path):
    print("Logs file not found")
    exit(1)

with open(logs_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
for idx in range(max(0, len(lines)-15), len(lines)):
    print(f"--- Line {idx+1} (Length: {len(lines[idx])}) ---")
    print(lines[idx][:1000])

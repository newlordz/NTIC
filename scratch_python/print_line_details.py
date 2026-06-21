import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

logs_path = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain\f6e5b095-c0ca-4c0c-91f5-84937bfc67fd\.system_generated\logs\transcript.jsonl"

with open(logs_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for idx in range(396, 420):
    if idx < len(lines):
        print(f"--- Line {idx+1} ---")
        print(lines[idx][:1500])
        print("*" * 40)

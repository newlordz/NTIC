import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

logs_path = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain\f6e5b095-c0ca-4c0c-91f5-84937bfc67fd\.system_generated\logs\transcript.jsonl"

with open(logs_path, 'r', encoding='utf-8', errors='ignore') as f:
    for idx, line in enumerate(f):
        if 'browser_subagent' in line:
            print(f"Line {idx+1}: {line[:300]}")

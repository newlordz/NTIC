import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

logs_path = r"C:\Users\NEWLORDZ\.gemini\antigravity-ide\brain\f6e5b095-c0ca-4c0c-91f5-84937bfc67fd\.system_generated\logs\transcript.jsonl"

if not os.path.exists(logs_path):
    print("Logs file not found")
    exit(1)

with open(logs_path, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if 'championship_stories_centered' in line or 'Inspect card info' in line or 'Get detailed styles' in line:
            # Let's see if we can find the output of the tool call
            # Parse line as json
            try:
                obj = json.loads(line)
                # If there's a tool output
                if obj.get('type') == 'TOOL_RESPONSE' or 'output' in obj:
                    print(f"Type: {obj.get('type')}, Status: {obj.get('status')}")
                    content = obj.get('content') or obj.get('output')
                    print(content[:2000])
                    print("="*80)
            except Exception as e:
                # Fallback to simple string match if not strict JSON
                idx = line.find('Inspect card info')
                if idx != -1:
                    print("STRING MATCH:\n", line[idx-200:idx+1800])
                    print("="*80)

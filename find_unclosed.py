import re

with open('NticPlatform.Frontend/src/app/pages/registration/registration.component.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for idx, line in enumerate(lines, 1):
    tokens = re.findall(r'(</?div[^>]*>)', line)
    for t in tokens:
        if t.startswith('</div'):
            if stack:
                stack.pop()
            else:
                print(f'Extra close at line {idx}: {t}')
        else:
            cls_match = re.search(r'class="([^"]*)"', t)
            cls_name = cls_match.group(1) if cls_match else ''
            stack.append((idx, t, cls_name))

print('Unclosed tags at end of file:')
for s in stack:
    print(f'Line {s[0]}: {s[1]} (class={s[2]})')

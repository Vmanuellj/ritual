import sys, re
content = open('index.html','r',encoding='utf-8').read()
print('Original size:', len(content))
# Verify markers exist
for m in ['PAGE: HABITS','PAGE: GYM','PAGE: FINANCE','PAGE: GOALS']:
    print(m, m in content)

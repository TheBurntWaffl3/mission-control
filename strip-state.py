#!/usr/bin/env python3
"""Replace the embedded state JSON of a Mission Control page with an empty state.
Usage: strip-state.py IN.html OUT.html
The page saves personal data inside <script id="state">; the committed copy must carry none of it."""
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
pat = re.compile(r'(<script type="application/json" id="state">).*?(</script>)', re.S)
out, n = pat.subn(r'\1{"v":2}\2', src, count=1)
assert n == 1, 'state script not found'
open(sys.argv[2], 'w', encoding='utf-8').write(out)
print('stripped', len(src) - len(out), 'bytes of state')

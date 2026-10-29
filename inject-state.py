#!/usr/bin/env python3
"""Carry the live state into a new page build.
Usage: inject-state.py LIVE.html PAGE.html OUT.html
Takes the <script id="state"> JSON from LIVE (the artifact as it is now) and puts it into PAGE
(this repo's code, which carries an empty state), writing OUT. Validates that both are JSON."""
import json, re, sys
pat = re.compile(r'(<script type="application/json" id="state">)(.*?)(</script>)', re.S)
live = open(sys.argv[1], encoding='utf-8').read()
page = open(sys.argv[2], encoding='utf-8').read()
m = pat.search(live); assert m, 'no state in live page'
state = m.group(2); json.loads(state)  # must parse
assert pat.search(page), 'no state slot in page'
out, n = pat.subn(lambda mm: mm.group(1) + state + mm.group(3), page, count=1)
assert n == 1
json.loads(pat.search(out).group(2))
open(sys.argv[3], 'w', encoding='utf-8').write(out)
print('injected', len(state), 'bytes of state; output', len(out), 'bytes')

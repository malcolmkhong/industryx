#!/usr/bin/env python
"""Fix TS errors in test files (BUG-004 scope)."""

import re

# 1. cloudflare-connectivity.test.ts: cast err to Error
p = "tests/integration/cloudflare-connectivity.test.ts"
with open(p, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r"\$\{err\.message\}", r"${(err as Error).message}", c)
c = re.sub(r"err\.name ===", r"(err as Error).name ===", c)
c = re.sub(r"err\.name\b(?! ===)", r"(err as Error).name", c)
c = re.sub(r"\$\{err\.name\}", r"${(err as Error).name}", c)

with open(p, "w", encoding="utf-8") as f:
    f.write(c)
print("cloudflare-connectivity.test.ts: written")

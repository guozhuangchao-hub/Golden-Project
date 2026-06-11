#!/usr/bin/env python3.11
"""修复 HypothesisEngine __init__ 加 cleanup_historical_duplicates 调用"""

path = "/opt/im-genius/agent/hypothesis.py"
with open(path, 'r') as f:
    hyp = f.read()

# 在 __init__ 最后一行、_ensure_split_stores 和 _load 之后插入
old = """        self._hypotheses: list[Hypothesis] = self._load()"""

new = """        self._hypotheses: list[Hypothesis] = self._load()
        # 启动时清理存量克隆假设
        try:
            self.cleanup_historical_duplicates()
        except Exception:
            pass"""

hyp = hyp.replace(old, new)

with open(path, 'w') as f:
    f.write(hyp)

import subprocess
r = subprocess.run(["python3.11", "-m", "py_compile", path], capture_output=True, text=True)
if r.returncode == 0:
    print("✅ 语法通过")
else:
    print(f"❌ {r.stderr[:200]}")

# 测试
r = subprocess.run(["python3.11", "-c", """
import sys; sys.path.insert(0, '/opt/im-genius')
from agent.hypothesis import HypothesisEngine
eng = HypothesisEngine()
from collections import defaultdict
groups = defaultdict(list)
for h in eng.get_market_hypotheses():
    if h.get(\"status\") != \"active\": continue
    key = (h.get(\"type\",\"\"), h.get(\"consequent\",{}).get(\"direction\",\"\"))
    groups[key].append(h[\"id\"])
for k, ids in groups.items():
    flag = \"CLONE\" if len(ids) > 1 else \"OK\"
    print(f\"  {k} -> {len(ids)}条 {flag}\")
"""], capture_output=True, text=True, timeout=30)
print(r.stdout)
if r.stderr: print("ERR:", r.stderr[:300])

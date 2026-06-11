#!/usr/bin/env python3.11
"""修复 Reality Anchor 插入位置——需要移到 reasoning 定义之后"""

path = "/opt/im-genius/agent/signal.py"
with open(path, 'r') as f:
    sig = f.read()

# 1. 删除当前位置（reasoning 定义之前）
old_block = """        reality_feedback = self._apply_reality_check()
        if reality_feedback.get("has_warning"):
            reasoning.append(reality_feedback["message"])
            if reality_feedback.get("confidence_cap") and reality_feedback["confidence_cap"] < 1.0:
                # 临时压低本次信号置信度上限
                pass  # cap applied at confidence calculation stage
        else:
            reasoning.append("[Reality Anchor] 本轮无异常")

        # ── 第二步：问假设库 ──"""

sig = sig.replace(old_block, """        # ── 第二步：问假设库 ──""")
print("✅ 删除原位置")

# 2. 插入到正确位置（reasoning = [] 之后）
old_reasoning = """        reasoning = []
        weights = {"bull": 0, "bear": 0, "hold": 0}
        hypotheses_used = []

        # 核心原则检查"""

new_reasoning = """        reasoning = []
        weights = {"bull": 0, "bear": 0, "hold": 0}
        hypotheses_used = []

        # ── Reality Anchor 反馈 ──
        reality_feedback = self._apply_reality_check()
        if reality_feedback.get("has_warning"):
            reasoning.append(reality_feedback["message"])
        else:
            reasoning.append("[Reality Anchor] 本轮无异常")

        # 核心原则检查"""

sig = sig.replace(old_reasoning, new_reasoning)
print("✅ 插入到正确位置")

with open(path, 'w') as f:
    f.write(sig)

# 验证
import subprocess
r = subprocess.run(["python3.11", "-m", "py_compile", path], capture_output=True, text=True)
if r.returncode == 0:
    print("✅ 语法通过")
else:
    print(f"❌ 语法错误: {r.stderr[:200]}")

# 运行测试
r = subprocess.run(["python3.11", "-c", """
import sys; sys.path.insert(0, '/opt/im-genius')
from agent.signal import SignalGenerator
gen = SignalGenerator()
result = gen.generate_signal()
print("Action:", result.get("action"))
print("Confidence:", result.get("confidence"))
for r in result.get("reasoning", []):
    if "Reality" in r:
        print("FOUND:", r)
"""], capture_output=True, text=True, timeout=30)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[:500])

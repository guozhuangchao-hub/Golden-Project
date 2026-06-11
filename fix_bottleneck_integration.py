#!/usr/bin/env python3.11
"""Bottleneck Hunter 集成到 signal.py 和 simulator.py

两个接入点：
  ① signal.py — 新增第 8 个信号维度 bottleneck_score
  ② simulator.py — 选股评分用 bottleneck 替代 trader_count 主导
"""

import sys

# ═══ 服务器 IM Genius 路径 ═══
BASE = "/opt/im-genius"
SIGNAL_PATH = f"{BASE}/agent/signal.py"
SIM_PATH = f"{BASE}/agent/simulator.py"

# ── ① signal.py 集成 ──
with open(SIGNAL_PATH, 'r') as f:
    sig = f.read()

# 1a. 在文件顶部 import 部分加入 bottleneck import
old_import = """from .phaser import PhaseController
from .repositories import ObservationRepository, SignalRepository
from .shadow import ShadowObserver"""

new_import = """from .bottleneck import get_bottleneck_signal_weight
from .phaser import PhaseController
from .repositories import ObservationRepository, SignalRepository
from .shadow import ShadowObserver"""

sig = sig.replace(old_import, new_import)

# 1b. 在 _evaluate_individual_candidates() 调用之后、综合判断之前插入瓶颈维度
# 定位到 "综合判断" 注释附近
old_comprehensive = """        # 综合判断
        total_weight = sum(weights.values()) or 1"""

new_comprehensive = """        # ── 瓶颈维度（第8个信号维度）──
        hotspots = [s.get("sector_name", s.get("f14", "")) for s in
                    observation.get("sources", {}).get("primary", {}).get("sector", {}).get("top", [])]
        if not hotspots:
            hotspots = [consensus.get("output", {}).get("strongest_consensus", [{}])[0].get("sector_name", "")] if consensus.get("output", {}).get("strongest_consensus") else []
        # 收集6位交易员持仓的所有CODE
        all_codes = []
        for info in individual.get("top_candidates", []):
            all_codes.append(info.get("symbol", ""))
        bottleneck_sig = get_bottleneck_signal_weight(hotspots, all_codes)

        if bottleneck_sig["bottleneck_bull"] > 0:
            weights["bull"] += bottleneck_sig["bottleneck_bull"]
            reasoning.append(f"[瓶颈猎手] 发现 {bottleneck_sig['high_quality_count']}/{bottleneck_sig['total_candidates']} 个瓶颈候选，偏多权重+{bottleneck_sig['bottleneck_bull']} (主题: {bottleneck_sig.get('theme','未知')})")
            for cand in bottleneck_sig.get("top_candidates", [])[:3]:
                reasoning.append(f"  ├ {cand['code']} {cand['name']} → 瓶颈机会分{cand['score']} ({cand['node']})")
        elif bottleneck_sig["bottleneck_hold"] > 0:
            weights["hold"] += bottleneck_sig["bottleneck_hold"]
            if bottleneck_sig.get("theme"):
                reasoning.append(f"[瓶颈猎手] 当前热门板块({bottleneck_sig['theme']})暂无高置信瓶颈标的，偏保守")
        for red in bottleneck_sig.get("red_flags", [])[:2]:
            reasoning.append(f"[瓶颈猎手·红色警报] {red['code']} {red['name']}: {red['reason']}")

        # 综合判断
        total_weight = sum(weights.values()) or 1"""

sig = sig.replace(old_comprehensive, new_comprehensive)

with open(SIGNAL_PATH, 'w') as f:
    f.write(sig)
print(f"✅ signal.py 已集成瓶颈维度")

# ── ② simulator.py 集成 ──
with open(SIM_PATH, 'r') as f:
    sim = f.read()

# 2a. 在文件顶部加 import
old_sim_import = """from .config import DATA_DIR, INITIAL_CAPITAL"""
new_sim_import = """from .bottleneck import get_hunter as _get_bh
from .config import DATA_DIR, INITIAL_CAPITAL"""

sim = sim.replace(old_sim_import, new_sim_import)

# 2b. 替换选股评分公式
# 找选股评分部分: 评分 = trader_count × 10 + total_owned / 1e6
old_score = "score = info[\"trader_count\"] * 2 + max(0, change_pct) * 5"
new_score = """            # bottleneck 加权：瓶颈机会分主导 + 交易员共识辅助
            bh = _get_bh()
            bottleneck_score = bh.get_candidate_score(sym)
            score = bottleneck_score * 0.8 + info["trader_count"] * 1.5 + max(0, change_pct) * 3"""
sim = sim.replace(old_score, new_score)

with open(SIM_PATH, 'w') as f:
    f.write(sim)
print(f"✅ simulator.py 已集成瓶颈选股")

# ═══ 验证语法 ═══
import subprocess
for p in [SIGNAL_PATH, SIM_PATH]:
    r = subprocess.run(["python3.11", "-m", "py_compile", p],
                       capture_output=True, text=True)
    if r.returncode == 0:
        print(f"✅ {p.split('/')[-1]} 语法检查通过")
    else:
        print(f"❌ {p.split('/')[-1]} 语法错误:\n{r.stderr[:200]}")

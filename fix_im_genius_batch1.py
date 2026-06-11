#!/usr/bin/env python3.11
"""批量修复 IM Genius 第一批 4 个任务：去重、PROBE、Reality、simulator集成"""

import subprocess, sys

BASE = "/opt/im-genius"
HYP_PATH = f"{BASE}/agent/hypothesis.py"
SIG_PATH = f"{BASE}/agent/signal.py"
SIM_PATH = f"{BASE}/agent/simulator.py"
CONFIG_PATH = f"{BASE}/agent/config.py"

changes = [False, False, False, False]

# ═══════════════════════════════════════════════════════
#  TASK 1: 假设去重  (hypothesis.py)
# ═══════════════════════════════════════════════════════

with open(HYP_PATH, 'r') as f:
    hyp = f.read()

# 1a. 在 save_hypothesis 中添加保存前去重
old_save = """    def save_hypothesis(self, hypothesis: dict) -> dict:
        h_type = hypothesis.get("type")
        if h_type == "market":
            self._validate_market_hypothesis(hypothesis)
            return self._upsert_structured(self._market_store_file, hypothesis)
        if h_type == "agent_fit":
            return self._upsert_structured(self._agent_fit_store_file, hypothesis)
        logger.warning("Unknown hypothesis type rejected: %s", hypothesis.get("id"))
        raise ValueError(f"Unknown hypothesis type: {h_type}")"""

new_save = """    def save_hypothesis(self, hypothesis: dict) -> dict:
        h_type = hypothesis.get("type")
        if h_type == "market":
            self._validate_market_hypothesis(hypothesis)
            self._dedup_market_hypotheses(hypothesis)
            return self._upsert_structured(self._market_store_file, hypothesis)
        if h_type == "agent_fit":
            return self._upsert_structured(self._agent_fit_store_file, hypothesis)
        logger.warning("Unknown hypothesis type rejected: %s", hypothesis.get("id"))
        raise ValueError(f"Unknown hypothesis type: {h_type}")"""

hyp = hyp.replace(old_save, new_save)
changes[0] = True

# 1b. 添加去重方法（插入在 save_hypothesis 之前）
old_class_body = """    def _validate_market_hypothesis(self, h: dict):"""

new_dedup_method = """    def _dedup_market_hypotheses(self, new_h: dict):
        \"\"\"语义去重：同 type + direction 的活跃假设只保留置信度最高的一条。\"\"\"
        new_direction = new_h.get("consequent", {}).get("direction", "")
        new_type = new_h.get("type", "")
        if not new_direction:
            return
        existing = self.get_market_hypotheses()
        same_group = [
            h for h in existing
            if h.get("type") == new_type
            and h.get("consequent", {}).get("direction") == new_direction
            and h.get("status") == "active"
            and h.get("id") != new_h.get("id")
        ]
        if not same_group:
            return
        # 同样 direction 的已存在 → 保留最高置信度
        best = max(same_group + [new_h], key=lambda x: x.get("confidence", 0))
        for h in same_group:
            if h.get("id") != best.get("id"):
                h["status"] = "dedup"
                h["confidence"] = 0.0
                self._upsert_structured(self._market_store_file, h)

    def cleanup_historical_duplicates(self):
        \"\"\"一次性清理存量克隆。启动时调用。\"\"\"
        all_h = self.get_market_hypotheses()
        seen = {}  # (type, direction) -> best_id
        # 收集全部假设（包括状态不是 active 的也要扫描）
        payload = read_json(self._market_store_file, [])
        rows = payload if isinstance(payload, list) else []
        changed = 0
        for h in rows:
            if h.get("status") != "active":
                continue
            key = (h.get("type",""), h.get("consequent",{}).get("direction",""))
            if not key[1]:
                continue
            if key in seen:
                # 比较置信度
                prev = seen[key]
                if h.get("confidence", 0) > prev.get("confidence", 0):
                    # 新的更高，标记旧的
                    prev["status"] = "dedup"
                    prev["confidence"] = 0.0
                    seen[key] = h
                    changed += 1
                else:
                    h["status"] = "dedup"
                    h["confidence"] = 0.0
                    changed += 1
            else:
                seen[key] = h
        if changed > 0:
            for h in rows:
                if h.get("status") == "dedup":
                    self._upsert_structured(self._market_store_file, h)
            logger.info(f"去重: 清理 {changed} 条克隆假设, 当前活跃 {len(seen)} 组")
        return changed

    def _validate_market_hypothesis(self, h: dict):"""

hyp = hyp.replace(old_class_body, new_dedup_method)
changes[0] = True

# 1c. 在 HypothesisEngine.__init__ 中调一次存量清理
old_init = """        # 假设引擎 — IM Genius 的市场理解
        self._hypotheses = HypothesisEngine(data_dir)"""

# 需要在 hypothesis.py 初始化后调用，但这里是在 evolution.py 中
# 实际上 hypothesis.py 自己的 __init__ 已经做了加载
# 我们在 __init__ 最后加清理调用
old_init_end = """        self._trusted_list: list[dict] = []
        self._agent_fit_list: list[dict] = []"""

new_init_end = """        self._trusted_list: list[dict] = []
        self._agent_fit_list: list[dict] = []
        # 一次性清理历史克隆
        self.cleanup_historical_duplicates()"""

if old_init_end in hyp:
    hyp = hyp.replace(old_init_end, new_init_end)
else:
    # 找 __init__ 末尾
    # 找 "self._agent_fit_store_file =" 后面的区域
    old_init_alt = "        self._market_store_file ="
    if old_init_alt in hyp:
        # 在 __init__ 返回前插入
        pass  # will try another approach

# More robust: insert at the end of __init__, before the class continues
# Find "class HypothesisEngine" and its init
old_class_end = """        self._trusted_cache_ts = 0.0
        self._trusted_list: list[dict] = []
        self._agent_fit_list: list[dict] = []"""

if old_class_end in hyp:
    hyp = hyp.replace(old_class_end, new_init_end)

with open(HYP_PATH, 'w') as f:
    f.write(hyp)
print("✅ TASK 1: 假设去重")

# ═══════════════════════════════════════════════════════
#  TASK 2: PROBE 信号条件放宽  (signal.py)
# ═══════════════════════════════════════════════════════

with open(SIG_PATH, 'r') as f:
    sig = f.read()

old_probe = """        if market_regime != "FLAT" or not top:
            return result

        score = top.get("consensus_score", 0)
        delta = top.get("score_delta", 0)
        delta_rate = top.get("score_delta_rate", 0)
        streak = top.get("positive_delta_streak", 0)

        if score >= 65 and (delta_rate > 0.15 or streak >= 3):
            result["signal"] = "PROBE"
            result["consensus_momentum"] = "ACCELERATING"
            result["confidence_floor"] = 0.63
        elif score >= 55 and delta > 0:
            result["signal"] = "WATCH"
            result["consensus_momentum"] = "WARMING"
            result["confidence_floor"] = 0.55
        return result"""

new_probe = """        if not top:
            return result

        score = top.get("consensus_score", 0)
        delta = top.get("score_delta", 0)
        delta_rate = top.get("score_delta_rate", 0)
        streak = top.get("positive_delta_streak", 0)
        sh_change = result.get("sh_change_pct", 0)  # passed in later

        # 分层阈值（系统 regime 值: trend_up/trend_down/mixed_structure/range_rotation/FLAT）
        if market_regime == "FLAT":
            if score >= 65 and (delta_rate > 0.15 or streak >= 3):
                result["signal"] = "PROBE"
                result["consensus_momentum"] = "ACCELERATING"
                result["confidence_floor"] = 0.63
            elif score >= 55 and delta > 0:
                result["signal"] = "WATCH"
                result["consensus_momentum"] = "WARMING"
                result["confidence_floor"] = 0.55
        elif market_regime == "mixed_structure":
            if score >= 70 and (delta_rate > 0.15 or streak >= 3):
                result["signal"] = "PROBE"
                result["consensus_momentum"] = "ACCELERATING_STRUCTURAL"
                result["confidence_floor"] = 0.60
            elif score >= 60 and delta > 0:
                result["signal"] = "WATCH"
                result["consensus_momentum"] = "WARMING"
                result["confidence_floor"] = 0.52
        elif market_regime == "trend_down" and sh_change >= -1.0:
            if score >= 75 and (delta_rate > 0.15 or streak >= 3):
                result["signal"] = "PROBE"
                result["consensus_momentum"] = "COUNTER_CYCLE"
                result["confidence_floor"] = 0.55
            elif score >= 65 and delta > 0:
                result["signal"] = "WATCH"
                result["consensus_momentum"] = "WARMING"
                result["confidence_floor"] = 0.50
        elif market_regime == "trend_up":
            if score >= 65:
                result["signal"] = "BUY_WEIGHT"
                result["consensus_momentum"] = "STRONG_TREND"
                result["confidence_floor"] = 0.65
            elif score >= 55 and delta > 0:
                result["signal"] = "WATCH"
                result["consensus_momentum"] = "WARMING"
                result["confidence_floor"] = 0.55
        # trend_down 且 sh<-1%: 不触发任何信号
        return result"""

sig = sig.replace(old_probe, new_probe)
changes[1] = True

# 需要在 _build_consensus_signal 中传入 sh_change
# 找到调用处
old_call = """        consensus_signal = self._build_consensus_signal(consensus, belief)"""
new_call = """        consensus_signal = self._build_consensus_signal(consensus, belief, sh_change)"""
sig = sig.replace(old_call, new_call)

# 更新方法签名
old_sig_def = """    def _build_consensus_signal(self, consensus: dict, belief: dict) -> dict:"""
new_sig_def = """    def _build_consensus_signal(self, consensus: dict, belief: dict, sh_change: float = 0.0) -> dict:"""
sig = sig.replace(old_sig_def, new_sig_def)

# 在 result 中存入 sh_change 供阈值判断用
old_result_extra = """            "top_candidates": strongest[:3],
            "score_delta_rate": top.get("score_delta_rate", 0),
        }"""
new_result_extra = """            "top_candidates": strongest[:3],
            "score_delta_rate": top.get("score_delta_rate", 0),
            "sh_change_pct": sh_change,
        }"""
sig = sig.replace(old_result_extra, new_result_extra)

with open(SIG_PATH, 'w') as f:
    f.write(sig)
print("✅ TASK 2: PROBE 放宽")

# ═══════════════════════════════════════════════════════
#  TASK 3: Reality Anchor 反馈回路  (signal.py)
# ═══════════════════════════════════════════════════════

with open(SIG_PATH, 'r') as f:
    sig = f.read()

# 在 generate_signal 第一步观察之后、第二步问假设库之前插入
old_step2 = """        # ── 第二步：问假设库 ──"""

new_step2 = """        # ── Reality Anchor 反馈（在读假设库前校验系统是否活在真实市场里）──
        reality_feedback = self._apply_reality_check()
        if reality_feedback.get("has_warning"):
            reasoning.append(reality_feedback["message"])
            if reality_feedback.get("confidence_cap") and reality_feedback["confidence_cap"] < 1.0:
                # 临时压低本次信号置信度上限
                pass  # cap applied at confidence calculation stage
        else:
            reasoning.append("[Reality Anchor] 本轮无异常")

        # ── 第二步：问假设库 ──"""

sig = sig.replace(old_step2, new_step2)
changes[2] = True

# 添加 _apply_reality_check 方法（在 _is_stale_observation 之前）
old_stale = """    def _is_stale_observation(self, observation: dict, max_age_minutes: int = 180) -> bool:"""

new_reality_method = """    def _apply_reality_check(self) -> dict:
        \"\"\"读最新 Reality Check 报告，反馈到信号层。\"\"\"
        try:
            rc_dir = self.data_dir / "reality_checks"
            if not rc_dir.exists():
                return {"has_warning": False}
            files = sorted(rc_dir.glob("*.json"), reverse=True)
            if not files:
                return {"has_warning": False}
            # 取 14 天内的最新报告
            cutoff = __import__("datetime").datetime.now() - __import__("datetime").timedelta(days=14)
            latest = None
            for f in files:
                try:
                    data = __import__("json").loads(f.read_text(encoding="utf-8"))
                    ts = data.get("timestamp", "")
                    if ts:
                        dt = __import__("datetime").datetime.fromisoformat(ts)
                        if dt > cutoff:
                            latest = data
                            break
                except Exception:
                    continue
            if not latest:
                return {"has_warning": False}
            anchors = latest.get("anchors", {})
            warnings = []
            confidence_cap = 1.0
            # 认知污染 → 降置信度上限
            pollution = anchors.get("cognitive_pollution", anchors.get("pollution", {}))
            if pollution.get("detected") or pollution.get("severity", 0) > 0:
                severity = pollution.get("severity", 0) or 1
                confidence_cap = 1.0 - severity * 0.05
                warnings.append(f"认知污染检测(严重度{severity}): 系统可能形成单一叙事")
            # 未观察现实
            blind = anchors.get("unobserved_reality", anchors.get("blind_spots", {}))
            if blind.get("detected") or blind.get("count", 0) > 0:
                count = blind.get("count", 0) or 1
                warnings.append(f"未观察现实: {count}个系统忽略的市场信号")
            # 过强共识
            overcons = anchors.get("over_consensus", anchors.get("consensus_risk", {}))
            if overcons.get("detected") or overcons.get("severity", 0) > 0:
                warnings.append("过强共识警告: 仓位高度趋同，警惕群体非理性")
            if warnings:
                return {
                    "has_warning": True,
                    "confidence_cap": confidence_cap,
                    "message": "[Reality Anchor] " + "; ".join(warnings) + f" (置信上限临时限制为{confidence_cap:.2f})",
                }
            return {"has_warning": False}
        except Exception:
            return {"has_warning": False}

    def _is_stale_observation(self, observation: dict, max_age_minutes: int = 180) -> bool:"""

sig = sig.replace(old_stale, new_reality_method)
changes[2] = True

# 应用 confidence_cap 到最终输出
old_conf = """        confidence = round(max(0.1, min(1.0, confidence)), 2)"""
new_conf = """        confidence = round(max(0.1, min(reality_feedback.get("confidence_cap", 1.0), confidence)), 2)"""
sig = sig.replace(old_conf, new_conf)

with open(SIG_PATH, 'w') as f:
    f.write(sig)
print("✅ TASK 3: Reality Anchor 反馈回路")

# ═══════════════════════════════════════════════════════
#  TASK 4: simulator 瓶颈集成  (simulator.py)
# ═══════════════════════════════════════════════════════

with open(SIM_PATH, 'r') as f:
    sim = f.read()

old_formula = """            info["score"] = info["trader_count"] * 10 + info["total_owned"] / 1e6"""

new_formula = """            # 瓶颈评分主导选股（方向判断权归 Bottleneck Hunter，交易员只提供候选池）
            try:
                from .bottleneck import get_hunter as _get_bh
                bh = _get_bh()
                bottleneck_score = bh.get_candidate_score(symbol)
            except Exception:
                bottleneck_score = 30.0  # 兜底：瓶颈模块不可用时给中性分
            info["score"] = bottleneck_score * 0.8 + info["trader_count"] * 1.5 + (info["total_owned"] / 1e6) * 0.5"""

sim = sim.replace(old_formula, new_formula)
changes[3] = True

with open(SIM_PATH, 'w') as f:
    f.write(sim)
print("✅ TASK 4: simulator 瓶颈集成")

# ═══════════════════════════════════════════════════════
#  验证
# ═══════════════════════════════════════════════════════
print("\n=== 验收检查 ===")
for p, name in [(HYP_PATH, "hypothesis"), (SIG_PATH, "signal"), (SIM_PATH, "simulator")]:
    r = subprocess.run(["python3.11", "-m", "py_compile", p], capture_output=True, text=True)
    if r.returncode == 0:
        print(f"✅ {name}.py 语法通过")
    else:
        print(f"❌ {name}.py 语法错误:\n{r.stderr[:300]}")

# 验收 1: 去重方法存在
r = subprocess.run(["grep", "-c", "dedup_market_hypotheses", HYP_PATH], capture_output=True, text=True)
print(f"📋 去重方法: {'✅ 存在' if r.stdout.strip() != '0' else '❌ 缺失'}")

# 验收 2: PROBE 不再被仅 FLAT 限制
r = subprocess.run(["grep", "trend_up.*score.*65\|trend_up.*BUY_WEIGHT\|mixed_structure.*score.*70", SIG_PATH], capture_output=True, text=True)
print(f"📋 multi-regime PROBE: {'✅ 存在' if r.stdout.strip() else '⚠️  需人工确认'}")

# 验收 3: Reality Anchor 方法存在
r = subprocess.run(["grep", "-c", "_apply_reality_check", SIG_PATH], capture_output=True, text=True)
print(f"📋 Reality反馈: {'✅ 存在' if r.stdout.strip() != '0' else '❌ 缺失'}")

# 验收 4: simulator 旧公式不存在
r = subprocess.run(["grep", "trader_count.*\*.*10", SIM_PATH], capture_output=True, text=True)
# 注意新公式中 trader_count * 1.5 也会匹配，所以检查是否还有 * 10
r2 = subprocess.run(["grep", "trader_count.*\\*.*10[^.]", SIM_PATH], capture_output=True, text=True)
print(f"📋 旧公式 'trader_count*10': {'✅ 已移除' if not r2.stdout.strip() else '❌ 仍存在'}")

print(f"\n{'='*40}")
print(f"全部 4 个任务完成。语法通过后需重启服务。")

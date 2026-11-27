"""Deterministic Claude Code usage stats and cost receipt for the talk.

Reads ~/.claude/projects/**/*.jsonl and AppData/Roaming/Claude/plan-usage-history.json,
writes lecture-1/src/data/stats.json. Prices: platform.claude.com/docs/en/about-claude/pricing
(retrieved 2026-10-17), USD per million tokens.
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

HOME = Path.home()
PROJECTS = HOME / ".claude" / "projects"
PLAN_USAGE = HOME / "AppData" / "Roaming" / "Claude" / "plan-usage-history.json"
OUT = Path(__file__).resolve().parents[1] / "data" / "stats.json"
# Frozen window so the talk's numbers do not drift as I keep working: first log day to the day before the deck was built.
UNTIL = "2026-10-16"

# base input, 5m write, 1h write, cache read, output
PRICES = {
    "opus-5-5": (4.00, 5.00, 8.00, 0.20, 20.00),
    "opus-5": (5.00, 6.25, 10.00, 0.50, 25.00),
    "sonnet-5-5": (2.00, 2.50, 4.00, 0.10, 10.00),
    "sonnet-5": (2.00, 2.50, 4.00, 0.20, 10.00),
    "haiku-4-5": (1.00, 1.25, 2.00, 0.10, 5.00),
}


def price_key(model: str):
    m = model.lower()
    for key in sorted(PRICES, key=len, reverse=True):
        if key in m:
            return key
    return None


def is_scripted(project_dir: str) -> bool:
    # Headless `claude -p` batch runs live under the Temp project folder.
    return "-AppData-Local-Temp" in project_dir  # sessions started from %TEMP% are scripted runs


USAGE_FIELDS = ("input_tokens", "output_tokens", "cache_read_input_tokens",
                "cache_creation_input_tokens", "w1h", "w5m")


def collect():
    """One record per API response. Streaming writes one jsonl line per content
    block with repeated (sometimes updated) usage, so keep the max of each field
    and the union of tool_use ids."""
    recs = {}
    for f in sorted(PROJECTS.rglob("*.jsonl")):
        proj = f.relative_to(PROJECTS).parts[0]
        with f.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if e.get("type") != "assistant":
                    continue
                msg = e.get("message") or {}
                mid, usage = msg.get("id"), msg.get("usage")
                model = msg.get("model", "?")
                if not mid or not usage or model.startswith("<"):
                    continue  # skip synthetic messages
                ccd = usage.get("cache_creation") or {}
                u = {k: usage.get(k, 0) or 0 for k in USAGE_FIELDS[:4]}
                u["w1h"] = ccd.get("ephemeral_1h_input_tokens", 0) or 0
                u["w5m"] = ccd.get("ephemeral_5m_input_tokens",
                                   u["cache_creation_input_tokens"] - u["w1h"]) or 0
                r = recs.setdefault(mid, {
                    "model": model, "proj": proj, "ts": e.get("timestamp", "")[:10],
                    "session": e.get("sessionId"), "tools": {},
                    **{k: 0 for k in USAGE_FIELDS}})
                for k in USAGE_FIELDS:
                    r[k] = max(r[k], u[k])
                for block in msg.get("content") or []:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        r["tools"][block.get("id")] = block.get("name", "?")
    return recs


def main():
    tot = defaultdict(lambda: defaultdict(float))  # scope -> metric -> value
    by_model = defaultdict(lambda: defaultdict(float))
    by_month = defaultdict(lambda: defaultdict(float))
    by_day = defaultdict(lambda: defaultdict(float))
    tools = Counter()
    sessions = defaultdict(set)
    unpriced = Counter()

    for r in collect().values():
        proj, model, ts = r["proj"], r["model"], r["ts"]
        if ts > UNTIL:
            continue
        scope = "scripted" if is_scripted(proj) else "interactive"
        sessions[scope].add(r["session"])
        tools.update(r["tools"].values())
        inp, out = r["input_tokens"], r["output_tokens"]
        cr, w1h, w5m = r["cache_read_input_tokens"], r["w1h"], r["w5m"]
        key = price_key(model)
        if key is None:
            unpriced[model] += 1
            actual = full = 0.0
        else:
            b, p5, p1, rd, o = PRICES[key]
            actual = (inp * b + w5m * p5 + w1h * p1 + cr * rd + out * o) / 1e6
            # Counterfactual: same tokens, no caching -> all input at base price.
            full = ((inp + w5m + w1h + cr) * b + out * o) / 1e6

        for bucket in (tot[scope], tot["all"], by_model[key or model],
                       by_month[ts[:7]], by_day[ts]):
            bucket["replies"] += 1
            bucket["input"] += inp
            bucket["output"] += out
            bucket["cache_read"] += cr
            bucket["cache_write_5m"] += w5m
            bucket["cache_write_1h"] += w1h
            bucket["cost_actual_usd"] += actual
            bucket["cost_nocache_usd"] += full
            bucket["cost_output_usd"] += (out * PRICES[key][4] / 1e6) if key else 0.0
            bucket["cost_cacheread_usd"] += (cr * PRICES[key][3] / 1e6) if key else 0.0

    def finish(d):
        d = {k: round(v, 4) if isinstance(v, float) else v for k, v in d.items()}
        inp_all = d["input"] + d["cache_read"] + d["cache_write_5m"] + d["cache_write_1h"]
        d["input_all"] = inp_all
        d["processed"] = inp_all + d["output"]
        d["cache_hit_rate"] = round(d["cache_read"] / inp_all, 4) if inp_all else 0
        d["saving_factor"] = (round(d["cost_nocache_usd"] / d["cost_actual_usd"], 2)
                              if d["cost_actual_usd"] else None)
        return d

    plan = {}
    if PLAN_USAGE.exists():
        samples = json.loads(PLAN_USAGE.read_text(encoding="utf-8"))
        if isinstance(samples, dict):
            samples = next((v for v in samples.values() if isinstance(v, list)), [])
        cutoff = datetime.fromisoformat(UNTIL).timestamp() * 1000 + 86400000
        samples = [x for x in samples if x.get("t", 0) < cutoff]
        # u.fh = 5-hour window %, u.sd = 7-day window %
        sd = [x["u"]["sd"] for x in samples if x.get("u", {}).get("sd") is not None]
        fh = [x["u"]["fh"] for x in samples if x.get("u", {}).get("fh") is not None]
        plan["samples"] = len(samples)
        plan["range"] = [datetime.fromtimestamp(samples[0]["t"] / 1000).date().isoformat(),
                         datetime.fromtimestamp(samples[-1]["t"] / 1000).date().isoformat()]
        plan["weekly_mean_pct"] = round(sum(sd) / len(sd), 1) if sd else None
        plan["weekly_ge90_samples"] = sum(v >= 90 for v in sd)
        plan["weekly_max_pct"] = max(sd) if sd else None
        plan["five_hour_max_pct"] = max(fh) if fh else None

    days = sorted(d for d in by_day if d)
    stats = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "until": UNTIL,
        "date_range": [days[0], days[-1]] if days else None,
        "active_days": len(days),
        "sessions": {k: len(v) for k, v in sessions.items()},
        "totals": {k: finish(v) for k, v in tot.items()},
        "by_model": {k: finish(v) for k, v in sorted(by_model.items())},
        "by_month": {k: finish(v) for k, v in sorted(by_month.items())},
        "by_day": {k: {"replies": v["replies"], "output": v["output"]}
                   for k, v in sorted(by_day.items()) if k},
        "tools_top": tools.most_common(12),
        "tools_total": sum(tools.values()),
        "unpriced_models": dict(unpriced),
        "plan_usage": plan,
        "prices_usd_per_mtok": PRICES,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(stats, indent=1), encoding="utf-8")
    t = stats["totals"]["all"]
    print(f"replies {t['replies']:.0f}  processed {t['processed']/1e9:.3f}B  "
          f"hit {t['cache_hit_rate']:.3%}  actual ${t['cost_actual_usd']:.0f}  "
          f"nocache ${t['cost_nocache_usd']:.0f}  x{t['saving_factor']}", file=sys.stderr)


if __name__ == "__main__":
    main()

"""RC 柱 P-M 離線交叉驗證：對照小工具（out_tool.json）與 concrete-properties（out_cp.json）。
φ 由本腳本依小工具同一規則套用到 cp 結果，因此 φ 一致不構成獨立驗證。
用法：python compare.py <輸出資料夾>；寫出 compare_tables.md 與 summary.json。"""
import json, pathlib, sys
OUT = pathlib.Path(sys.argv[1]).resolve()
T = json.loads((OUT / "out_tool.json").read_text(encoding="utf-8"))
C = json.loads((OUT / "out_cp.json").read_text(encoding="utf-8"))
def pct(a, b): return 0.0 if b == 0 else (a - b) / abs(b) * 100
def phi_of(epsT, ety, pc=0.65, pt=0.90):
    if epsT >= ety + 0.003: return pt
    if epsT <= ety: return pc
    return pc + (pt - pc) * (epsT - ety) / 0.003
def interpM(curve, P):  # 依 P 線性內插 M，取最大（同小工具 phiMnAtPu 邏輯）
    best = None
    for A, B in zip(curve, curve[1:]):
        if (A["P"] - P) * (B["P"] - P) <= 0 and A["P"] != B["P"]:
            t = (P - A["P"]) / (B["P"] - A["P"]); M = A["M"] + t * (B["M"] - A["M"])
            best = M if best is None else max(best, M)
    return best
lines, summary = [], {}
for cid in T:
    t, c = T[cid], C[cid]
    lines.append(f"\n## {cid}\n")
    lines.append("| 關鍵點 | 小工具 Pn (kN) | cp Pn (kN) | ΔP % | 小工具 Mn (kN·m) | cp Mn (kN·m) | ΔM % |")
    lines.append("|---|---|---|---|---|---|---|")
    rows = [("純軸壓 Po", t["Po_kN"], c["Po_kN"], 0, 0),
            ("平衡點 (εt=εty)", t["balanced"]["P"], c["balanced"]["P"], t["balanced"]["M"], c["balanced"]["M"]),
            ("純彎 (Pn=0)", t["pureBending"]["P"], c["pureBending"]["P"], t["pureBending"]["M"], c["pureBending"]["M"])]
    key_rel = []  # 關鍵點相對差（純彎 Pn 兩邊皆約 0，不計百分比）
    for n, tp, cp_, tm, cm in rows:
        dP = pct(tp, cp_) if abs(cp_) > 1e-6 else 0.0
        dM = pct(tm, cm) if abs(cm) > 1e-6 else 0.0
        if not n.startswith("純彎"): key_rel.append(abs(pct(tp, cp_)))
        if abs(cm) > 1e-6: key_rel.append(abs(pct(tm, cm)))
        lines.append(f"| {n} | {tp:.2f} | {cp_:.2f} | {dP:+.3f} | {tm:.2f} | {cm:.2f} | {dM:+.3f} |")
    dPs, dMs = [], []
    lines.append("\n同一中性軸深度 c 逐點對照（標稱值）：\n")
    lines.append("| c/h | 小工具 Pn | cp Pn | ΔP % | 小工具 Mn | cp Mn | ΔM % |")
    lines.append("|---|---|---|---|---|---|---|")
    for a, b in zip(t["scan"], c["scan"]):
        dP = pct(a["P"], b["P"]); dM = pct(a["M"], b["M"]); dPs.append(abs(dP)); dMs.append(abs(dM))
        lines.append(f"| {a['c']/t['input']['h']:.2f} | {a['P']:.1f} | {b['P']:.1f} | {dP:+.3f} | {a['M']:.1f} | {b['M']:.1f} | {dM:+.3f} |")
    lines.append(f"\n逐點最大絕對差：ΔP {max(dPs):.3f}%、ΔM {max(dMs):.3f}%")
    diffs = []  # 整條曲線：在 cp 互制圖各 P 處內插小工具標稱 M（排除 P <= -0.2·Po 與 M < 1 kN·m 的點）
    for p in c["mid"]:
        if p["P"] <= 0.02 * c["Po_kN"] * -10 or p["M"] < 1: continue
        mt = interpM(t["nominal"], p["P"])
        if mt: diffs.append(pct(mt, p["M"]))
    curve_max = max(abs(d) for d in diffs); curve_mean = sum(abs(d) for d in diffs) / len(diffs)
    lines.append(f"整條標稱曲線（cp moment_interaction_diagram {len(c['mid'])} 點，於相同 Pn 內插小工具 Mn）：最大 |ΔM| = {curve_max:.3f}%，平均 |ΔM| = {curve_mean:.3f}%（{len(diffs)} 點）")
    lines.append(f"關鍵點最大相對差（Po、平衡點 Pn／Mn、純彎 Mn）：{max(key_rel):.2e}%")
    ety, dt = t["epsTy"], t["dt"]
    for name, key in [("平衡點", "balanced"), ("純彎", "pureBending")]:
        cc = c[key]["c"]; eT = 0.003 * (dt - cc) / cc; ph = phi_of(eT, ety)
        lines.append(f"{name} φ：小工具 {t[key]['phi']:.4f}，cp 自行套用 {ph:.4f}；φMn 小工具 {t[key]['phi']*t[key]['M']:.2f}、cp {ph*c[key]['M']:.2f} kN·m")
    lines.append(f"φPn,max（0.80·0.65·Po）：小工具 {t['phiPnMax_kN']:.2f} kN；cp 以其 Po 計 {0.8*0.65*c['Po_kN']:.2f} kN")
    summary[cid] = dict(key_point_max_rel_pct=max(key_rel), scan_max_dP_pct=max(dPs), scan_max_dM_pct=max(dMs),
                        curve_max_dM_pct=curve_max, curve_mean_dM_pct=curve_mean, curve_points=len(diffs))
txt = "\n".join(lines)
(OUT / "compare_tables.md").write_text(txt, encoding="utf-8")
(OUT / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
print(json.dumps(summary, indent=1))

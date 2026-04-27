/**
 * 17 章公式速查 Reference Panel：純靜態內容，無計算依賴。
 *
 * 整理自台灣 112 規範第 17 章（≈ ACI 318-19 Ch.17）；本卡為靜態參考，
 * 實際計算以工具引擎為準（含所有 ψ 因子調整）。
 *
 * 從 App.tsx 抽出（~85 行）；無 props，純展示，預設摺疊。
 */
export function FormulaReferencePanel() {
  return (
    <details
      className="fold-panel sub-panel formula-reference-panel"
      data-shows="result"
      open={false}
    >
      <summary className="fold-summary">
        <span>17 章公式速查（規範參考）</span>
        <small>群錨 / 拉力 / 剪力 / 互制核心公式與變數定義</small>
      </summary>
      <div className="fold-stack formula-reference-stack">
        <p className="helper-text">
          整理自台灣 112 規範第 17 章（≈ ACI 318-19 Ch.17）。
          本卡為靜態參考，實際計算以工具引擎為準（含所有 ψ 因子調整）。
        </p>
        <div className="formula-reference-grid">
          <article className="formula-card">
            <h4>17.6.1 鋼材拉力</h4>
            <code>φN_sa = φ · n · A_se,N · f_uta</code>
            <small>f_uta ≤ min(1.9·f_ya, 860 MPa)；φ = 0.75（ductile 鋼材）</small>
          </article>
          <article className="formula-card">
            <h4>17.6.2 混凝土拉破</h4>
            <code>
              φN_cbg = φ · (A_Nc/A_Nco) · ψ_ec,N · ψ_ed,N · ψ_c,N · ψ_cp,N · N_b
            </code>
            <small>
              N_b = k_c · λ_a · √f'c · h_ef^1.5；k_c = 10（預埋）/ 7（後置）
              <br />A_Nco = 9·h_ef²；ψ_ed,N = 0.7 + 0.3·c_a,min/(1.5·h_ef)
            </small>
          </article>
          <article className="formula-card">
            <h4>17.6.3 拉出（Headed）</h4>
            <code>φN_pn = φ · ψ_c,P · N_p；N_p = 8 · A_brg · f'c</code>
            <small>
              彎鉤式（Hooked）：N_p = 0.9 · f'c · e_h · d_a，3·d_a ≤ e_h ≤ 4.5·d_a
            </small>
          </article>
          <article className="formula-card">
            <h4>17.6.4 側面破裂</h4>
            <code>φN_sb = φ · 13 · c_a1 · √A_brg · λ_a · √f'c</code>
            <small>僅適用 h_ef &gt; 2.5·c_a1 之預埋 headed 錨栓</small>
          </article>
          <article className="formula-card">
            <h4>17.7.1 鋼材剪力</h4>
            <code>φV_sa = φ · n · 0.6 · A_se,V · f_uta</code>
            <small>預埋 not-grouted 加 sleeve 取 0.6；後置依產品評估值</small>
          </article>
          <article className="formula-card">
            <h4>17.7.2 混凝土剪破</h4>
            <code>
              φV_cbg = φ · (A_Vc/A_Vco) · ψ_ec,V · ψ_ed,V · ψ_c,V · ψ_h,V · V_b
            </code>
            <small>
              V_b = 0.6·(l_e/d_a)^0.2·√d_a·λ_a·√f'c·c_a1^1.5（≤ 3.7·λ·√f'c·c_a1^1.5）
              <br />A_Vco = 4.5·c_a1²；多邊距時 c_a1 取 max(c_a2/1.5, h_a/1.5, s/3)
            </small>
          </article>
          <article className="formula-card">
            <h4>17.7.3 撬出</h4>
            <code>φV_cp = φ · k_cp · N_cbg</code>
            <small>
              k_cp = 1.0（h_ef &lt; 65 mm）/ 2.0（h_ef ≥ 65 mm）；以 N_cbg 為基底
            </small>
          </article>
          <article className="formula-card">
            <h4>17.8.3 拉剪互制</h4>
            <code>N_ua/φN_n + V_ua/φV_n ≤ 1.2</code>
            <small>
              或 5/3 次方：(N/φN_n)^5/3 + (V/φV_n)^5/3 ≤ 1.0
              <br />任一比值 ≤ 0.2 時免作互制（17.8.1 / 17.8.2）
            </small>
          </article>
          <article className="formula-card formula-card-vars">
            <h4>主要變數定義</h4>
            <ul>
              <li>
                <code>h_ef</code>：有效埋置深度
              </li>
              <li>
                <code>c_a1, c_a,min</code>：邊距 / 最小邊距
              </li>
              <li>
                <code>A_Nc / A_Nco</code>：實際 / 單錨拉破投影面積
              </li>
              <li>
                <code>A_Vc / A_Vco</code>：實際 / 單錨剪破投影面積
              </li>
              <li>
                <code>A_brg</code>：錨頭 / 附板淨承壓面積
              </li>
              <li>
                <code>ψ_ec, ψ_ed, ψ_c, ψ_cp</code>：偏心 / 邊距 / 裂縫 / 後置劈裂修正
              </li>
              <li>
                <code>λ_a</code>：輕質混凝土修正（一般 = 1.0）
              </li>
            </ul>
          </article>
        </div>
      </div>
    </details>
  )
}

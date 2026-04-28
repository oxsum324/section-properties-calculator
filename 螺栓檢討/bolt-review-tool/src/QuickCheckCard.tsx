import type { ReviewResult, UnitPreferences } from './domain'
import { formatQuantity } from './formatHelpers'

/**
 * 群錨折減係數 / 單錨強度速檢卡：依 17.6.2 / 17.6.1.2，由目前 review 結果抽出
 * 既有因子（A_Nc/A_Nco、ψ_ed,N、ψ_ec,N、ψ_c,N、φ）+ 單錨設計強度（鋼材 / 拉出），
 * 直接判定「單錨是否足夠 vs 必須群錨」並列出公式與數值。
 *
 * 從 App.tsx 抽出（~210 行）；P1 拆分序列之一。
 */
export function QuickCheckCard(props: {
  review: ReviewResult
  unitPreferences: UnitPreferences
}) {
  const { review, unitPreferences } = props

  const breakout = review.results.find(
    (r) => r.id === 'concrete-breakout-tension',
  )
  const steelTension = review.results.find((r) => r.id === 'steel-tension')
  const pullout = review.results.find((r) => r.id === 'pullout')

  const factorValue = (
    result: typeof breakout,
    symbol: string,
  ): number | null => {
    if (!result) return null
    const found = result.factors?.find((f) => f.symbol === symbol)
    if (!found) return null
    const v =
      typeof found.value === 'number'
        ? found.value
        : Number.parseFloat(String(found.value))
    return Number.isFinite(v) ? v : null
  }

  const areaRatio = factorValue(breakout, 'A_Nc/A_Nco')
  const psiEdN = factorValue(breakout, 'ψ_ed,N')
  const psiEcN = factorValue(breakout, 'ψ_ec,N')
  const psiCN = factorValue(breakout, 'ψ_c,N')
  const phiN = factorValue(breakout, 'φ')
  const nAnchors = review.anchorPoints.length || 1
  const tensionDemandKn = Math.max(0, review.analysisLoads.tensionKn)
  const perAnchorDemand = tensionDemandKn / nAnchors

  // 單錨強度：steel Nsa/ anchor / n（已內含群效應），取 min 作為單錨限制
  const phiNsaTotal = steelTension?.designStrengthKn ?? 0
  const phiNsaSingle = phiNsaTotal > 0 ? phiNsaTotal / nAnchors : null
  // pullout 為群錨合計 min(Ncbg, Np·n)；取 Npn 單錨需回推
  const phiNpnSingle = (() => {
    const phiFactor = factorValue(pullout, 'φ')
    const npFactor = pullout?.factors?.find((f) => f.symbol === 'N_p')
    const rawNp =
      npFactor && typeof npFactor.value === 'number' ? npFactor.value : null
    if (phiFactor && rawNp) return phiFactor * rawNp
    // 回退：pullout designStrengthKn 為群錨合計，除以 n
    const total = pullout?.designStrengthKn ?? 0
    return total > 0 ? total / nAnchors : null
  })()
  const singleMin =
    [phiNsaSingle, phiNpnSingle]
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .sort((a, b) => a - b)[0] ?? null
  // 單錨是否足夠：每支分擔拉力 ≤ 單錨最小設計強度
  const singleAnchorOk = singleMin !== null && perAnchorDemand <= singleMin
  const groupReductionProduct =
    areaRatio !== null &&
    psiEdN !== null &&
    psiEcN !== null &&
    psiCN !== null
      ? areaRatio * psiEdN * psiEcN * psiCN
      : null

  return (
    <section className="quick-check-card" data-shows="loads">
      <header className="quick-check-header">
        <strong>群錨折減係數 / 單錨強度速檢</strong>
        <small>依 17.6.2 / 17.6.1.2；由目前幾何 + 載重即時算出</small>
      </header>
      <div className="quick-check-grid">
        <div className="quick-check-col">
          <h4>群錨折減係數(拉破)</h4>
          <table className="quick-check-table">
            <tbody>
              <tr>
                <td>A_Nc / A_Nco</td>
                <td>{areaRatio !== null ? areaRatio.toFixed(3) : '—'}</td>
              </tr>
              <tr>
                <td>ψ_ed,N（邊距）</td>
                <td>{psiEdN !== null ? psiEdN.toFixed(3) : '—'}</td>
              </tr>
              <tr>
                <td>ψ_ec,N（偏心）</td>
                <td>{psiEcN !== null ? psiEcN.toFixed(3) : '—'}</td>
              </tr>
              <tr>
                <td>ψ_c,N（裂縫）</td>
                <td>{psiCN !== null ? psiCN.toFixed(3) : '—'}</td>
              </tr>
              <tr className="quick-check-total">
                <td>總折減 = 乘積</td>
                <td>
                  {groupReductionProduct !== null
                    ? groupReductionProduct.toFixed(3)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>φ (強度折減)</td>
                <td>{phiN !== null ? phiN.toFixed(2) : '—'}</td>
              </tr>
            </tbody>
          </table>
          <small className="helper-text">
            Ncbg = (A_Nc/A_Nco)·ψ_ed·ψ_ec·ψ_c·Nb；φNcbg ={' '}
            {breakout
              ? formatQuantity(
                  breakout.designStrengthKn,
                  'force',
                  unitPreferences,
                )
              : '—'}
          </small>
        </div>
        <div className="quick-check-col">
          <h4>單錨設計強度（每支）</h4>
          <table className="quick-check-table">
            <tbody>
              <tr>
                <td>φN_sa（鋼材）</td>
                <td>
                  {phiNsaSingle !== null
                    ? formatQuantity(phiNsaSingle, 'force', unitPreferences)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>φN_pn（拉出）</td>
                <td>
                  {phiNpnSingle !== null
                    ? formatQuantity(phiNpnSingle, 'force', unitPreferences)
                    : '—'}
                </td>
              </tr>
              <tr className="quick-check-total">
                <td>單錨最小 = min(上述)</td>
                <td>
                  {singleMin !== null
                    ? formatQuantity(singleMin, 'force', unitPreferences)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>每支分擔 = N_ua / n</td>
                <td>
                  {formatQuantity(perAnchorDemand, 'force', unitPreferences)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div
        className={`quick-check-verdict ${
          singleAnchorOk ? 'pass' : 'need-group'
        }`}
      >
        {singleMin === null ? (
          <span>資料不足，請先設定產品評估值與幾何</span>
        ) : singleAnchorOk ? (
          <span>
            <strong>✓ 單錨即足夠</strong>：每支分擔{' '}
            {formatQuantity(perAnchorDemand, 'force', unitPreferences)} ≤
            單錨最小{' '}
            {formatQuantity(singleMin, 'force', unitPreferences)}。
            群錨混凝土拉破仍須另行滿足（見結果頁）。
          </span>
        ) : (
          <span>
            <strong>⚠ 需群錨檢核</strong>：每支分擔{' '}
            {formatQuantity(perAnchorDemand, 'force', unitPreferences)} &gt;
            單錨最小{' '}
            {formatQuantity(singleMin, 'force', unitPreferences)}；
            須倚賴群錨折減後 φNcbg 或補強鋼筋路徑，不可僅以單錨強度代表。
          </span>
        )}
      </div>
    </section>
  )
}

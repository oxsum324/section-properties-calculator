(function(global){
  'use strict';

  function dashboardServerInfo(status, options){
    const toolHtml = options?.toolHtml || '';
    const appVersion = String(options?.appVersion || '').replace(/^V/i, '');
    if(!status) return { text:'確認中', cls:'warn' };
    if(!status.ok) return { text:'未連線', cls:'warn' };
    const sameHtml = status.tool_html === toolHtml;
    const sameVersion = String(status.server_version || '') === appVersion;
    if(sameHtml && sameVersion){
      return { text:`v${status.server_version} 一致`, cls:'ok' };
    }
    const parts = [];
    if(!sameHtml) parts.push(`HTML ${status.tool_html || '未知'}`);
    if(!sameVersion) parts.push(`server v${status.server_version || '未知'}`);
    return { text:parts.join('；') || '需確認', cls:'ng' };
  }

  function escapeHtml(text){
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function deliveryQualityGradeFromSummary(summary, formula, issueRows, serverInfo=null, options={}){
    const s = summary || {};
    const f = formula || {};
    const rows = Array.isArray(issueRows) ? issueRows : [];
    const unnotedIssues = rows.filter(row => !row.note);
    const reasons = [];
    const blockers = [];
    const caseCount = Number(s.caseCount || 0);
    const failedTotal = Number(s.failedTotal || 0);
    const warningTotal = Number(s.warningTotal || 0);
    const formulaTotal = Number(f.total || 0);
    const formulaCovered = Number(f.covered || 0);
    if(!caseCount) blockers.push('尚未建立案例');
    if(failedTotal > 0) blockers.push(`${failedTotal} 項檢核未通過`);
    if(formulaTotal && formulaCovered < formulaTotal) blockers.push(`${formulaTotal - formulaCovered} 項公式來源未登錄`);
    if(serverInfo?.cls === 'ng') blockers.push('工具與伺服器版本不一致');
    if(blockers.length){
      return { code:'C', text:'C 先修正', cls:'ng', reasons:[...blockers, ...reasons] };
    }
    if(warningTotal > 0) reasons.push(`${warningTotal} 項警示`);
    if(unnotedIssues.length) reasons.push(`${unnotedIssues.length} 項覆核註記未填`);
    if(serverInfo?.cls === 'warn') reasons.push(`伺服器狀態${serverInfo.text || '待確認'}`);
    if(options.signatureRequired) reasons.push('簽章資料待補');
    if(options.referenceRequired) reasons.push('設計依據未選取');
    if(reasons.length){
      return { code:'B', text:'B 附註交付', cls:'warn', reasons };
    }
    return { code:'A', text:'A 可交付', cls:'ok', reasons:['主要檢核、公式來源、覆核與版本狀態皆完成'] };
  }

  function deliveryQualityReasonText(grade){
    const reasons = Array.isArray(grade?.reasons) ? grade.reasons : [];
    return reasons.length ? reasons.join('；') : '—';
  }

  function deliveryQualityChecklistItem(grade){
    if(!grade || (grade.code !== 'C' && grade.code !== 'B')) return null;
    const level = grade.code === 'C' ? 'warn' : 'info';
    return { level, text:`交付品質為「${grade.text}」：${deliveryQualityReasonText(grade)}。` };
  }

  function exportChecklistHtml(items){
    const rows = Array.isArray(items) ? items : [];
    if(!rows.length){
      return '<p style="color:#2f6b32;margin-bottom:6px">匯出前檢查完成，未發現需特別確認的項目。</p>';
    }
    return `<p style="color:#a5691a;margin-bottom:6px">匯出前有 ${rows.length} 項需確認：</p><ul>${
      rows.map(item => `<li>${item.level === 'info' ? '提示：' : ''}${escapeHtml(item.text)}</li>`).join('')
    }</ul><p style="margin-top:6px;color:#555">建議返回修正後再匯出；若為刻意設定，可按下方按鈕繼續。</p>`;
  }

  function exportChecklistNeedsConfirmation(items){
    const rows = Array.isArray(items) ? items : [];
    return rows.some(item => item.level !== 'info');
  }

  global.StoneReviewDashboard = {
    dashboardServerInfo,
    deliveryQualityGradeFromSummary,
    deliveryQualityChecklistItem,
    exportChecklistNeedsConfirmation,
    exportChecklistHtml,
    deliveryQualityReasonText,
  };
})(window);

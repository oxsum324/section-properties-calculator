import type { ReactNode } from 'react'

export type ResourceLibraryTabId =
  | 'project_templates'
  | 'product_templates'
  | 'product_scan'

export interface ResourceLibraryTab {
  id: ResourceLibraryTabId
  label: string
  description: string
  badge?: string
}

export interface ResourceLibraryHubProps {
  activeTab: ResourceLibraryTabId
  tabs: ResourceLibraryTab[]
  onTabChange: (tabId: ResourceLibraryTabId) => void
  children: ReactNode
}

function ResourceLibraryHub(props: ResourceLibraryHubProps) {
  const { activeTab, tabs, onTabChange, children } = props
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  return (
    <section className="panel resource-hub">
      <div className="resource-hub-header">
        <div className="panel-title">
          <h2>資源庫</h2>
          <p>把案件樣板、產品模板與產品掃描整合在同一入口，先選流程，再進入對應工具，不會在多個面板之間來回切換。</p>
        </div>
        <div className="resource-hub-status">
          <span className="resource-hub-kicker">目前工具</span>
          <strong>{activeTabMeta?.label ?? '資源庫'}</strong>
          <small>{activeTabMeta?.description ?? ''}</small>
        </div>
      </div>

      <div className="resource-hub-tabs" role="tablist" aria-label="資源庫工具">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`resource-hub-tab ${tab.id === activeTab ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge ? <small>{tab.badge}</small> : null}
          </button>
        ))}
      </div>

      <div className="resource-hub-body">{children}</div>
    </section>
  )
}

export default ResourceLibraryHub

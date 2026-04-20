import { useCallback, useEffect, useState } from 'react'
import {
  canAccessCompanyPage,
  hasAnyUserPermission,
  hasUserPermission,
  isCompanyAdminUser,
  PERMISSIONS,
} from './access'

const EMPTY_VARIANT = {
  sku: '',
  sellingPrice: '',
  barcode: '',
  size: '',
  color: '',
  flavor: '',
  model: '',
  attribute1: '',
  attribute2: '',
  openingQuantity: '',
}

const EMPTY_SALE_LINE = {
  productVariantId: '',
  quantity: 1,
}

const ALL_BRANCHES_VALUE = '__all_branches__'

const PAYMENT_METHODS = [
  'Cash',
  'Telebirr',
  'Chapa',
  'Cbe Birr',
  'Bank Transfer',
  'Card',
  'Other',
]

const SALES_REPORT_PERMISSIONS = [
  PERMISSIONS.reportViewSales,
  PERMISSIONS.reportViewSalesToday,
  PERMISSIONS.reportViewSalesYesterday,
  PERMISSIONS.reportViewSalesWeek,
  PERMISSIONS.reportViewSalesMonth,
  PERMISSIONS.reportViewSalesYear,
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'ETB',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function formatDate(value) {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleString()
}

function formatSalesWindowRange(window) {
  if (!window) {
    return 'Not available'
  }

  const from = new Date(window.fromUtc)
  const to = new Date(window.toUtc)
  const isSameDay = from.toDateString() === to.toDateString()

  if (isSameDay) {
    return from.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
  }

  const sameYear = from.getFullYear() === to.getFullYear()
  const startDate = from.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const endDate = to.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })

  return `${startDate} - ${endDate}`
}

function buildSalesDashboardPath(branchScope, windowKey) {
  const query = windowKey ? `?window=${encodeURIComponent(windowKey)}` : ''

  if (!branchScope || branchScope === ALL_BRANCHES_VALUE) {
    return `/reports/sales-dashboard${query}`
  }

  return `/reports/sales-dashboard/${branchScope}${query}`
}

function buildTransferStatusQuery(status) {
  return status ? `?status=${encodeURIComponent(status)}` : ''
}

function buildBranchLowStockPath(branchId) {
  return `/inventory/branch/${branchId}/low-stock`
}

function buildBranchTransfersPath(branchId, status) {
  return `/inventory/branch/${branchId}/transfers${buildTransferStatusQuery(status)}`
}

function buildBranchProductsPath(branchId, search) {
  const query = new URLSearchParams({ pageSize: '100' })
  if (search) {
    query.set('search', search)
  }

  return `/products/branch/${branchId}?${query.toString()}`
}

function buildBranchTransferCreatePath(branchId) {
  return `/inventory/branch/${branchId}/transfers`
}

function buildBranchAuditsPath(branchId) {
  return `/inventory/branch/${branchId}/audits`
}

function buildBranchAdjustmentPath(branchId) {
  return `/inventory/branch/${branchId}/adjust`
}

function buildInventoryLowStockPath(branchScope) {
  return !branchScope || branchScope === ALL_BRANCHES_VALUE
    ? '/inventory/low-stock'
    : buildBranchLowStockPath(branchScope)
}

function buildInventoryTransfersPath(branchScope, status) {
  return !branchScope || branchScope === ALL_BRANCHES_VALUE
    ? `/inventory/transfers${buildTransferStatusQuery(status)}`
    : buildBranchTransfersPath(branchScope, status)
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildVariantLabel(variant) {
  const details = [
    variant.variantDescription,
    variant.size,
    variant.color,
    variant.flavor,
    variant.model,
    variant.attribute1,
    variant.attribute2,
  ].filter(Boolean)

  const detailText = [...new Set(details)].join(' / ')
  return detailText && detailText !== variant.sku
    ? `${variant.productName ?? ''} ${detailText} (${variant.sku})`.trim()
    : `${variant.productName ?? ''} ${variant.sku}`.trim()
}

function exportCsv(filename, headers, rows) {
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
        .join(','),
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const values = []
      let current = ''
      let insideQuotes = false

      for (let index = 0; index < line.length; index += 1) {
        const character = line[index]

        if (character === '"') {
          if (insideQuotes && line[index + 1] === '"') {
            current += '"'
            index += 1
          } else {
            insideQuotes = !insideQuotes
          }
          continue
        }

        if (character === ',' && !insideQuotes) {
          values.push(current)
          current = ''
          continue
        }

        current += character
      }

      values.push(current)
      return values.map((value) => value.trim())
    })
}

function normalizeProductVariants(products) {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      ...variant,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      category: product.category,
      unitOfMeasure: product.unitOfMeasure,
      reorderPoint: product.reorderPoint,
    })),
  )
}

export function CompanyDashboardPage({ api, session }) {
  const [snapshot, setSnapshot] = useState({
    branches: [],
    lowStock: [],
    stockSummary: [],
    transfers: [],
  })
  const [availability, setAvailability] = useState({
    branches: true,
    lowStock: true,
    stockSummary: true,
    transfers: true,
  })
  const [loading, setLoading] = useState(true)
  const [attentionLoading, setAttentionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [salesOverview, setSalesOverview] = useState(null)
  const [salesMetadataLoading, setSalesMetadataLoading] = useState(false)
  const [salesLoading, setSalesLoading] = useState(false)
  const [todaySalesLoading, setTodaySalesLoading] = useState(false)
  const [todaySalesWindow, setTodaySalesWindow] = useState(null)
  const [salesMessage, setSalesMessage] = useState('')
  const [activeSalesWindowKey, setActiveSalesWindowKey] = useState('')
  const canViewAllBranchSales = hasUserPermission(
    session,
    PERMISSIONS.reportViewSalesAllBranches,
  )

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setMessage('')

      const [branchesResult, stockSummaryResult] =
        await Promise.allSettled([
          api.get('/branches/assigned'),
          api.get('/reports/stock-summary'),
        ])

      if (!active) {
        return
      }

      if (branchesResult.status !== 'fulfilled') {
        setAvailability({
          branches: false,
          lowStock: false,
          stockSummary: stockSummaryResult.status === 'fulfilled',
          transfers: false,
        })
        setSnapshot({
          branches: [],
          lowStock: [],
          stockSummary: [],
          transfers: [],
        })
        setMessage(branchesResult.reason?.message ?? 'Dashboard branches could not be loaded.')
        setLoading(false)
        return
      }

      setAvailability({
        branches: true,
        lowStock: true,
        stockSummary: stockSummaryResult.status === 'fulfilled',
        transfers: true,
      })
      setSnapshot({
        branches: branchesResult.value,
        lowStock: [],
        stockSummary: stockSummaryResult.status === 'fulfilled' ? stockSummaryResult.value : [],
        transfers: [],
      })
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [api])

  useEffect(() => {
    setSelectedBranchId((current) =>
      current === ALL_BRANCHES_VALUE && canViewAllBranchSales
        ? current
        : snapshot.branches.some((branch) => branch.id === current)
          ? current
          : canViewAllBranchSales && snapshot.branches.length > 0
            ? ALL_BRANCHES_VALUE
            : snapshot.branches[0]?.id ?? '',
    )
  }, [canViewAllBranchSales, snapshot.branches])

  useEffect(() => {
    let active = true

    if (!selectedBranchId) {
      setAttentionLoading(false)
      setSnapshot((current) => ({ ...current, lowStock: [], transfers: [] }))
      return () => {
        active = false
      }
    }

    async function loadAttention() {
      setAttentionLoading(true)

      const [lowStockResult, transfersResult] = await Promise.allSettled([
        api.get(buildInventoryLowStockPath(selectedBranchId)),
        api.get(buildInventoryTransfersPath(selectedBranchId, 'Pending')),
      ])

      if (!active) {
        return
      }

      setAvailability((current) => ({
        ...current,
        lowStock: lowStockResult.status === 'fulfilled',
        transfers: transfersResult.status === 'fulfilled',
      }))
      setSnapshot((current) => ({
        ...current,
        lowStock: lowStockResult.status === 'fulfilled' ? lowStockResult.value : [],
        transfers: transfersResult.status === 'fulfilled' ? transfersResult.value : [],
      }))
      setAttentionLoading(false)
    }

    void loadAttention()
    return () => {
      active = false
    }
  }, [api, selectedBranchId])

  useEffect(() => {
    let active = true

    if (!selectedBranchId) {
      setSalesOverview(null)
      setTodaySalesWindow(null)
      setActiveSalesWindowKey('')
      setSalesMessage(
        snapshot.branches.length === 0
          ? 'Assign at least one branch to unlock sales insights.'
          : 'Select a branch scope to load sales insights.',
      )
      return () => {
        active = false
      }
    }

    async function loadSalesOverviewMetadata() {
      setSalesMetadataLoading(true)
      setSalesOverview(null)
      setTodaySalesWindow(null)
      setActiveSalesWindowKey('')
      setSalesMessage('')

      try {
        const result = await api.get(buildSalesDashboardPath(selectedBranchId))
        if (!active) {
          return
        }

        setSalesOverview(result)
        setActiveSalesWindowKey((current) =>
          result.availableWindows.some((window) => window.key === current)
            ? current
            : result.availableWindows[0]?.key ?? '',
        )
      } catch (error) {
        if (active) {
          setSalesOverview(null)
          setTodaySalesWindow(null)
          setActiveSalesWindowKey('')
          setSalesMessage(error.message)
        }
      } finally {
        if (active) {
          setSalesMetadataLoading(false)
        }
      }
    }

    void loadSalesOverviewMetadata()
    return () => {
      active = false
    }
  }, [api, selectedBranchId, snapshot.branches.length])

  useEffect(() => {
    let active = true

    if (!selectedBranchId || !activeSalesWindowKey) {
      setSalesOverview((current) => (current ? { ...current, window: null } : null))
      return () => {
        active = false
      }
    }

    async function loadSelectedSalesWindow() {
      setSalesLoading(true)
      setSalesMessage('')

      try {
        const result = await api.get(
          buildSalesDashboardPath(selectedBranchId, activeSalesWindowKey),
        )
        if (!active) {
          return
        }

        setSalesOverview(result)
      } catch (error) {
        if (active) {
          setSalesOverview((current) => (current ? { ...current, window: null } : null))
          setSalesMessage(error.message)
        }
      } finally {
        if (active) {
          setSalesLoading(false)
        }
      }
    }

    void loadSelectedSalesWindow()
    return () => {
      active = false
    }
  }, [activeSalesWindowKey, api, selectedBranchId])

  useEffect(() => {
    let active = true

    const salesWindowOptions = salesOverview?.availableWindows ?? []
    const canViewTodaySales = salesWindowOptions.some((window) => window.key === 'today')

    if (!selectedBranchId || !canViewTodaySales) {
      setTodaySalesWindow(null)
      setTodaySalesLoading(false)
      return () => {
        active = false
      }
    }

    if (activeSalesWindowKey === 'today') {
      setTodaySalesWindow(salesOverview?.window?.key === 'today' ? salesOverview.window : null)
      setTodaySalesLoading(false)
      return () => {
        active = false
      }
    }

    async function loadTodaySalesWindow() {
      setTodaySalesLoading(true)

      try {
        const result = await api.get(buildSalesDashboardPath(selectedBranchId, 'today'))
        if (!active) {
          return
        }

        setTodaySalesWindow(result.window ?? null)
      } catch {
        if (active) {
          setTodaySalesWindow(null)
        }
      } finally {
        if (active) {
          setTodaySalesLoading(false)
        }
      }
    }

    void loadTodaySalesWindow()
    return () => {
      active = false
    }
  }, [activeSalesWindowKey, api, salesOverview, selectedBranchId])

  const totalUnits = snapshot.stockSummary.reduce((sum, item) => sum + item.totalQuantity, 0)
  const branchScopeOptions = canViewAllBranchSales
    ? [{ id: ALL_BRANCHES_VALUE, name: 'All branches' }, ...snapshot.branches]
    : snapshot.branches
  const selectedSalesScopeName =
    salesOverview?.branchName ??
    branchScopeOptions.find((branch) => branch.id === selectedBranchId)?.name ??
    'the selected scope'
  const salesWindowOptions = salesOverview?.availableWindows ?? []
  const activeSalesWindow = salesOverview?.window ?? null
  const isSalesSectionLoading =
    salesMetadataLoading ||
    salesLoading ||
    (salesWindowOptions.length > 0 && !activeSalesWindow && !salesMessage)
  const isTodaySalesLoading =
    salesMetadataLoading ||
    (activeSalesWindowKey === 'today' ? isSalesSectionLoading : todaySalesLoading)
  const canViewTodaySales = salesWindowOptions.some((window) => window.key === 'today')

  return (
    <div className="page-stack">
      {message ? <InlineMessage text={message} tone="error" /> : null}

      <section className="stats-grid">
        <StatCard
          label="Branches"
          value={loading ? '...' : availability.branches ? snapshot.branches.length : 'Restricted'}
          note="Accessible locations for this user"
        />
        <StatCard
          label="Tracked variants"
          value={
            loading
              ? '...'
              : availability.stockSummary
                ? snapshot.stockSummary.length
                : 'Restricted'
          }
          note={
            availability.stockSummary
              ? 'Sellable stock units'
              : 'Needs inventory reporting access'
          }
        />
        <StatCard
          label="Total stock"
          value={
            loading
              ? '...'
              : availability.stockSummary
                ? formatNumber(totalUnits)
                : 'Restricted'
          }
          note={
            availability.stockSummary
              ? 'Combined central and branch quantity'
              : 'Needs inventory reporting access'
          }
        />
        <StatCard
          label="Today sales"
          value={
            isTodaySalesLoading
              ? '...'
              : todaySalesWindow
                ? formatCurrency(todaySalesWindow.netSalesValue)
                : selectedBranchId
                  ? canViewTodaySales
                    ? '--'
                    : 'Restricted'
                  : '--'
          }
          note={
            todaySalesWindow
              ? `Net sales for ${selectedSalesScopeName}`
              : 'Visible only when this branch has a permitted today sales window'
          }
        />
      </section>

      <section className="content-card">
        <div className="section-heading">
          <p className="eyebrow">Operations overview</p>
          <h3>Immediate attention</h3>
          <p>Low stock and pending transfers that need action.</p>
        </div>

        {loading || attentionLoading ? (
          <EmptyCard text="Loading dashboard..." compact />
        ) : !availability.lowStock && !availability.transfers ? (
          <EmptyCard text="Inventory alerts are unavailable for this role." compact />
        ) : (
          <div className="stack-list">
            <div className="mini-summary">
              <strong>{availability.lowStock ? snapshot.lowStock.length : 'Restricted'}</strong>
              <span>
                {availability.lowStock
                  ? 'Variants at or below reorder point'
                  : 'Low stock alerts require stock access'}
              </span>
            </div>
            <div className="mini-summary">
              <strong>{availability.transfers ? snapshot.transfers.length : 'Restricted'}</strong>
              <span>
                {availability.transfers
                  ? 'Pending transfer requests'
                  : 'Pending transfers require stock access'}
              </span>
            </div>
            {availability.lowStock
              ? snapshot.lowStock.slice(0, 4).map((item) => (
                  <article key={item.productVariantId} className="list-card compact-card">
                    <strong>{item.productName}</strong>
                    <span>
                      {item.variantDescription} | {item.currentQuantity} {item.unitOfMeasure}
                    </span>
                  </article>
                ))
              : null}
          </div>
        )}
      </section>

      <section className="content-card sales-analytics-shell">
        <div className="sales-analytics-header">
          <div className="section-heading">
            <h3>Branch sales insights</h3>
            <p>
              Sales windows are permission-aware. Roles only see the reporting windows
              enabled for the selected branch.
            </p>
          </div>

          {snapshot.branches.length > 0 ? (
            <div className="sales-filter-controls">
              <FormField label={canViewAllBranchSales ? 'Branch scope' : 'Branch'}>
                <select
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                >
                  {branchScopeOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Sales window">
                <select
                  value={activeSalesWindowKey}
                  disabled={salesWindowOptions.length === 0}
                  onChange={(event) => setActiveSalesWindowKey(event.target.value)}
                >
                  {salesWindowOptions.length === 0 ? (
                    <option value="">
                      {salesMetadataLoading ? 'Loading windows...' : 'No windows available'}
                    </option>
                  ) : (
                    salesWindowOptions.map((window) => (
                      <option key={window.key} value={window.key}>
                        {window.label}
                      </option>
                    ))
                  )}
                </select>
              </FormField>
            </div>
          ) : null}
        </div>

        {isSalesSectionLoading ? (
          <EmptyCard text="Loading sales insights..." compact />
        ) : salesMessage ? (
          <EmptyCard text={salesMessage} compact />
        ) : !salesOverview || salesWindowOptions.length === 0 ? (
          <EmptyCard text="No sales insight windows are enabled for this role yet." compact />
        ) : (
          <>
            {activeSalesWindow ? (
              <div className="sales-analytics-layout">
                <article className="sales-spotlight-panel">
                  <div className="sales-spotlight-header">
                    <div className="sales-spotlight-copy">
                      <span className="status-pill subtle">{salesOverview.branchName}</span>
                      <h3>{activeSalesWindow.label}</h3>
                      <p>
                        {formatSalesWindowRange(activeSalesWindow)} | Sales and refunds for
                        the selected scope in the active reporting window.
                      </p>
                    </div>
                    <div className="sales-spotlight-total">
                      <span>Net sales</span>
                      <strong>{formatCurrency(activeSalesWindow.netSalesValue)}</strong>
                    </div>
                  </div>

                  <div className="sales-metric-strip">
                    <div className="sales-metric-card">
                      <span>Gross sales</span>
                      <strong>{formatCurrency(activeSalesWindow.totalSalesValue)}</strong>
                    </div>
                    <div className="sales-metric-card">
                      <span>Transactions</span>
                      <strong>{formatNumber(activeSalesWindow.transactionCount)}</strong>
                    </div>
                    <div className="sales-metric-card">
                      <span>Units sold</span>
                      <strong>{formatNumber(activeSalesWindow.quantitySold)}</strong>
                    </div>
                    <div className="sales-metric-card">
                      <span>Average ticket</span>
                      <strong>{formatCurrency(activeSalesWindow.averageTicketValue)}</strong>
                    </div>
                    <div className="sales-metric-card">
                      <span>Refunds</span>
                      <strong>{formatCurrency(activeSalesWindow.refundAmount)}</strong>
                    </div>
                  </div>

                  <SalesTrendChart points={activeSalesWindow.trend} />
                </article>

                <div className="sales-side-stack">
                  <article className="sales-breakdown-card">
                    <div className="section-heading">
                      <h3>Payment mix</h3>
                      <p>How this branch collected revenue in the selected window.</p>
                    </div>
                    <PaymentBreakdownList items={activeSalesWindow.paymentBreakdown} />
                  </article>

                  <article className="sales-breakdown-card">
                    <div className="section-heading">
                      <h3>Top products</h3>
                      <p>The strongest products by quantity sold in the selected window.</p>
                    </div>
                    <TopProductsList items={activeSalesWindow.topProducts} />
                  </article>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

function SalesTrendChart({ points }) {
  if (points.length === 0) {
    return (
      <div className="sales-chart">
        <div className="section-heading">
          <h3>Sales graph</h3>
          <p>Line graph of branch sales for the active reporting window.</p>
        </div>

        <EmptyCard text="No sales activity in this window yet." compact />
      </div>
    )
  }

  const chartHeight = 148
  const plotTop = 14
  const plotBottom = 86
  const labelY = 110
  const valueY = 126
  const columnCount = Math.max(points.length, 1)
  const chartWidth = Math.max(columnCount * 72, 240)
  const slotWidth = chartWidth / columnCount
  const plotHeight = plotBottom - plotTop
  const highestSalesValue = Math.max(...points.map((point) => Number(point.salesValue)), 0)
  const chartPoints = points.map((point, index) => {
    const salesValue = Number(point.salesValue)
    const ratio = highestSalesValue === 0 ? 0.5 : salesValue / highestSalesValue

    return {
      ...point,
      salesValue,
      x: slotWidth * index + slotWidth / 2,
      y: plotBottom - ratio * plotHeight,
    }
  })
  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const lastChartPoint = chartPoints[chartPoints.length - 1]
  const areaPath =
    chartPoints.length > 1
      ? `${linePath} L ${lastChartPoint.x} ${plotBottom} L ${chartPoints[0].x} ${plotBottom} Z`
      : ''
  const guideLinePositions = [plotTop, plotTop + plotHeight / 2, plotBottom]

  return (
    <div className="sales-chart">
      <div className="section-heading">
        <h3>Sales graph</h3>
        <p>Simple line view of branch sales for the active reporting window.</p>
      </div>

      <div className="sales-chart-scroll">
        <div className="sales-chart-canvas" style={{ minWidth: `${chartWidth}px` }}>
          <svg
            className="sales-chart-svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label="Line chart showing branch sales across the active reporting window"
          >
            {guideLinePositions.map((position) => (
              <line
                key={position}
                className="sales-chart-guide"
                x1="0"
                x2={chartWidth}
                y1={position}
                y2={position}
              />
            ))}

            {areaPath ? <path className="sales-chart-area" d={areaPath} /> : null}
            {chartPoints.length > 1 ? <path className="sales-chart-line" d={linePath} /> : null}

            {chartPoints.map((point) => (
              <g key={`${point.bucketStartUtc}-${point.label}`}>
                <title>{`${point.label}: ${formatCurrency(point.salesValue)}`}</title>
                <circle className="sales-chart-point" cx={point.x} cy={point.y} r="5" />
                <circle className="sales-chart-point-core" cx={point.x} cy={point.y} r="2.4" />
                <text className="sales-chart-label" x={point.x} y={labelY} textAnchor="middle">
                  {point.label}
                </text>
                <text className="sales-chart-value" x={point.x} y={valueY} textAnchor="middle">
                  {formatCurrency(point.salesValue)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}

function PaymentBreakdownList({ items }) {
  if (items.length === 0) {
    return <EmptyCard text="No payment activity in this window yet." compact />
  }

  return (
    <div className="sales-breakdown-list">
      {items.map((item) => (
        <div key={item.paymentMethod} className="sales-breakdown-row">
          <div>
            <strong>{item.paymentMethod}</strong>
            <span>{formatNumber(item.transactionCount)} transactions</span>
          </div>
          <strong>{formatCurrency(item.totalSalesValue)}</strong>
        </div>
      ))}
    </div>
  )
}

function TopProductsList({ items }) {
  if (items.length === 0) {
    return <EmptyCard text="No products sold in this window yet." compact />
  }

  return (
    <div className="sales-product-list">
      {items.map((item) => (
        <div key={item.productVariantId} className="sales-product-row">
          <div>
            <strong>{item.productName}</strong>
            <span>
              {item.variantDescription} | {item.sku}
            </span>
          </div>
          <div className="sales-product-meta">
            <strong>{formatNumber(item.quantitySold)} sold</strong>
            <span>{formatCurrency(item.totalSalesValue)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProductsPage({ api, session }) {
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    code: '',
    name: '',
    category: '',
    unitOfMeasure: 'piece',
    description: '',
    reorderPoint: 0,
  })
  const [variants, setVariants] = useState([{ ...EMPTY_VARIANT }])
  const selectedBranchName =
    branches.find((branch) => branch.id === selectedBranchId)?.name ?? 'the selected branch'
  const canCreateProduct = hasUserPermission(session, PERMISSIONS.productCreate)
  const canImportProducts = hasUserPermission(session, PERMISSIONS.productImport)
  const canExportProducts = hasUserPermission(session, PERMISSIONS.productExport)

  const loadProducts = useCallback(async (branchId) => {
    if (!branchId) {
      setProducts([])
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const result = await api.get(buildBranchProductsPath(branchId))
      setProducts(result.items ?? [])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    let active = true

    async function loadBranches() {
      setLoading(true)
      setMessage('')

      try {
        const branchResult = await api.get('/branches/assigned')
        if (!active) {
          return
        }

        setBranches(branchResult)
        setSelectedBranchId((current) =>
          branchResult.some((branch) => branch.id === current) ? current : branchResult[0]?.id ?? '',
        )
      } catch (error) {
        if (active) {
          setBranches([])
          setSelectedBranchId('')
          setMessage(error.message)
          setLoading(false)
        }
      }
    }

    void loadBranches()
    return () => {
      active = false
    }
  }, [api])

  useEffect(() => {
    void loadProducts(selectedBranchId)
  }, [loadProducts, selectedBranchId])

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      await api.post('/products', {
        ...form,
        reorderPoint: toNumber(form.reorderPoint),
        variants: variants.map((variant) => ({
          ...variant,
          sku: variant.sku.trim(),
          sellingPrice: toNumber(variant.sellingPrice),
          openingQuantity: toNumber(variant.openingQuantity),
        })),
      })

      setForm({
        code: '',
        name: '',
        category: '',
        unitOfMeasure: 'piece',
        description: '',
        reorderPoint: 0,
      })
      setVariants([{ ...EMPTY_VARIANT }])
      await loadProducts(selectedBranchId)
      setMessage('Product created.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function exportProducts() {
    const rows = products.flatMap((product) =>
      product.variants.map((variant) => [
        product.code,
        product.name,
        product.category,
        product.unitOfMeasure,
        product.reorderPoint,
        variant.sku,
        variant.size,
        variant.color,
        variant.flavor,
        variant.model,
        variant.attribute1,
        variant.attribute2,
        variant.sellingPrice,
        variant.totalQuantity,
      ]),
    )

    exportCsv(
      'products.csv',
      [
        'Code',
        'Name',
        'Category',
        'Unit',
        'ReorderPoint',
        'SKU',
        'Size',
        'Color',
        'Flavor',
        'Model',
        'Attribute1',
        'Attribute2',
        'SellingPrice',
        'ScopedQuantity',
      ],
      rows,
    )
  }

  async function importProducts(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setImporting(true)
    setMessage('')

    try {
      const rows = parseCsv(await file.text())
      const [headers, ...records] = rows

      if (!headers || records.length === 0) {
        throw new Error('The CSV file is empty.')
      }

      const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]))
      const productsByCode = new Map()

      for (const row of records) {
        const code = row[indexByHeader.Code]
        if (!code) {
          continue
        }

        const existing = productsByCode.get(code) ?? {
          code,
          name: row[indexByHeader.Name] ?? '',
          category: row[indexByHeader.Category] ?? '',
          unitOfMeasure: row[indexByHeader.Unit] ?? 'piece',
          description: '',
          reorderPoint: toNumber(row[indexByHeader.ReorderPoint]),
          variants: [],
        }

        existing.variants.push({
          sku: row[indexByHeader.SKU] ?? '',
          size: row[indexByHeader.Size] ?? '',
          color: row[indexByHeader.Color] ?? '',
          flavor: row[indexByHeader.Flavor] ?? '',
          model: row[indexByHeader.Model] ?? '',
          attribute1: row[indexByHeader.Attribute1] ?? '',
          attribute2: row[indexByHeader.Attribute2] ?? '',
          barcode: '',
          sellingPrice: toNumber(row[indexByHeader.SellingPrice]),
          openingQuantity: toNumber(
            row[indexByHeader.ScopedQuantity] ?? row[indexByHeader.CentralQuantity],
          ),
        })

        productsByCode.set(code, existing)
      }

      for (const product of productsByCode.values()) {
        await api.post('/products', product)
      }

      await loadProducts(selectedBranchId)
      setMessage(`Imported ${productsByCode.size} products.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      event.target.value = ''
      setImporting(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Catalog"
        title="Products and variants"
        description="Create generic products with flexible variants for shoes, electronics, groceries, or any other stock type."
        action={
          canImportProducts || canExportProducts ? (
            <div className="hero-actions">
              {canImportProducts ? (
                <label className="ghost-button file-picker">
                  {importing ? 'Importing...' : 'Import CSV'}
                  <input type="file" accept=".csv" disabled={importing} onChange={importProducts} />
                </label>
              ) : null}
              {canExportProducts ? (
                <button type="button" className="ghost-button" onClick={exportProducts}>
                  Export CSV
                </button>
              ) : null}
            </div>
          ) : null
        }
      />

      {message ? (
        <InlineMessage
          text={message}
          tone={message === 'Product created.' || message.startsWith('Imported ') ? 'info' : 'error'}
        />
      ) : null}

      <section className="split-grid">
        {canCreateProduct ? (
          <form className="content-card stack-form" onSubmit={handleSubmit}>
            <div className="section-heading">
              <h3>Create product</h3>
              <p>Add a product with one or more sellable variants.</p>
            </div>

            <div className="input-grid">
              <FormField label="Product code">
                <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
              </FormField>
              <FormField label="Product name">
                <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </FormField>
              <FormField label="Category">
                <input required value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
              </FormField>
              <FormField label="Unit of measure">
                <input required value={form.unitOfMeasure} onChange={(event) => setForm((current) => ({ ...current, unitOfMeasure: event.target.value }))} />
              </FormField>
              <FormField label="Reorder point">
                <input type="number" min="0" value={form.reorderPoint} onChange={(event) => setForm((current) => ({ ...current, reorderPoint: event.target.value }))} />
              </FormField>
              <FormField label="Description">
                <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </FormField>
            </div>

            <div className="section-heading">
              <h3>Variants</h3>
              <p>Capture size, color, flavor, model, or your own custom attributes.</p>
            </div>

            <div className="editor-stack">
              {variants.map((variant, index) => (
                <article key={`variant-${index}`} className="editor-card">
                  <div className="list-card-header">
                    <strong>Variant {index + 1}</strong>
                    {variants.length > 1 ? (
                      <button type="button" className="ghost-button danger" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="input-grid">
                    {Object.entries({
                      sku: 'SKU',
                      sellingPrice: 'Selling price',
                      openingQuantity: 'Opening quantity',
                      barcode: 'Barcode',
                      size: 'Size',
                      color: 'Color',
                      flavor: 'Flavor',
                      model: 'Model',
                      attribute1: 'Attribute 1',
                      attribute2: 'Attribute 2',
                    }).map(([key, label]) => (
                      <FormField key={key} label={label}>
                        <input
                          required={key === 'sku' || key === 'sellingPrice'}
                          type={key === 'sellingPrice' || key === 'openingQuantity' ? 'number' : 'text'}
                          min={key === 'sellingPrice' || key === 'openingQuantity' ? '0' : undefined}
                          step={key === 'sellingPrice' ? '0.01' : undefined}
                          value={variant[key]}
                          onChange={(event) =>
                            setVariants((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, [key]: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormField>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="page-actions">
              <button type="button" className="ghost-button" onClick={() => setVariants((current) => [...current, { ...EMPTY_VARIANT }])}>
                Add variant
              </button>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? 'Saving...' : 'Create product'}
              </button>
            </div>
          </form>
        ) : null}

        <section className="content-card">
          <div className="section-heading">
            <h3>Current catalog</h3>
            <p>
              {loading
                ? 'Loading products...'
                : `${products.length} products visible for ${selectedBranchName}`}
            </p>
          </div>

          <FormField label="Branch scope">
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </FormField>

          {loading ? (
            <EmptyCard text="Loading products..." compact />
          ) : !selectedBranchId ? (
            <EmptyCard text="Select a branch to load products." compact />
          ) : products.length === 0 ? (
            <EmptyCard text="No products created yet." compact />
          ) : (
            <div className="stack-list">
              {products.map((product) => (
                <article key={product.id} className="list-card spacious-card">
                  <div className="list-card-header">
                    <div>
                      <strong>
                        {product.name} <span className="muted-inline">({product.code})</span>
                      </strong>
                      <span>{product.category} • {product.unitOfMeasure} • reorder at {product.reorderPoint}</span>
                    </div>
                    <span className={product.isActive ? 'status-pill success' : 'status-pill'}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="stack-list dense-list">
                    {product.variants.map((variant) => (
                      <article key={variant.id} className="mini-row">
                        <div>
                          <strong>{variant.sku}</strong>
                          <span>{buildVariantLabel({ ...variant, productName: product.name })}</span>
                        </div>
                        <div className="mini-row-meta">
                          <span>{formatCurrency(variant.sellingPrice)}</span>
                          <span>{selectedBranchName} {variant.totalQuantity}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

export function InventoryPage({ api, session }) {
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [centralInventory, setCentralInventory] = useState([])
  const [branchInventory, setBranchInventory] = useState([])
  const [audits, setAudits] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [branchLoading, setBranchLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [adjustment, setAdjustment] = useState({
    productVariantId: '',
    branchId: '',
    quantityChange: '',
    reason: '',
  })

  const variants = normalizeProductVariants(products)
  const isCompanyAdmin = isCompanyAdminUser(session)
  const canAdjustInventory = hasUserPermission(session, PERMISSIONS.stockAdjust)
  const selectedBranchName =
    branches.find((branch) => branch.id === selectedBranchId)?.name ?? 'the selected branch'

  const loadPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [branchResult, centralResult] = await Promise.all([
        api.get('/branches/assigned'),
        api.get('/inventory/central'),
      ])

      setBranches(branchResult)
      setCentralInventory(centralResult)
      setSelectedBranchId((current) =>
        branchResult.some((branch) => branch.id === current) ? current : branchResult[0]?.id ?? '',
      )
      setAdjustment((current) => {
        if (isCompanyAdmin) {
          return branchResult.some((branch) => branch.id === current.branchId)
            ? current
            : { ...current, branchId: '' }
        }

        return branchResult.some((branch) => branch.id === current.branchId)
          ? current
          : { ...current, branchId: branchResult[0]?.id ?? '' }
      })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api, isCompanyAdmin])

  const loadBranchContext = useCallback(async (branchId) => {
    setBranchLoading(true)

    try {
      const [productResult, inventoryResult, lowStockResult, auditResult] = await Promise.all([
        api.get(buildBranchProductsPath(branchId)),
        api.get(`/inventory/branch/${branchId}`),
        api.get(buildBranchLowStockPath(branchId)),
        api.get(buildBranchAuditsPath(branchId)),
      ])

      setProducts(productResult.items ?? [])
      setBranchInventory(inventoryResult)
      setLowStock(lowStockResult)
      setAudits(auditResult)
    } catch (error) {
      setProducts([])
      setBranchInventory([])
      setLowStock([])
      setAudits([])
      setMessage(error.message)
    } finally {
      setBranchLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    if (selectedBranchId) {
      void loadBranchContext(selectedBranchId)
      return
    }

    setBranchLoading(false)
    setProducts([])
    setBranchInventory([])
    setLowStock([])
    setAudits([])
  }, [loadBranchContext, selectedBranchId])

  async function submitAdjustment(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      if (!adjustment.branchId && !isCompanyAdmin) {
        throw new Error('Select a branch to adjust inventory.')
      }

      const requestBody = {
        productVariantId: adjustment.productVariantId,
        quantityChange: toNumber(adjustment.quantityChange),
        reason: adjustment.reason,
      }

      if (adjustment.branchId) {
        await api.post(buildBranchAdjustmentPath(adjustment.branchId), requestBody)
      } else {
        await api.post('/inventory/adjust', { ...requestBody, branchId: null })
      }

      setAdjustment({
        productVariantId: '',
        branchId: isCompanyAdmin ? '' : adjustment.branchId,
        quantityChange: '',
        reason: '',
      })
      await loadPage()
      if (selectedBranchId) {
        await loadBranchContext(selectedBranchId)
      }
      setMessage('Inventory adjusted.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inventory"
        title="Balances and adjustments"
        description="Review central and branch stock, then log adjustments with a reason so every movement is auditable."
      />

      {message ? (
        <InlineMessage text={message} tone={message === 'Inventory adjusted.' ? 'info' : 'error'} />
      ) : null}

      <section className="split-grid">
        {canAdjustInventory ? (
          <form className="content-card stack-form" onSubmit={submitAdjustment}>
            <div className="section-heading">
              <h3>Inventory adjustment</h3>
              <p>Positive values add stock. Negative values remove stock.</p>
            </div>

            <FormField label="Variant">
              <select required value={adjustment.productVariantId} onChange={(event) => setAdjustment((current) => ({ ...current, productVariantId: event.target.value }))}>
                <option value="">Select a variant</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {buildVariantLabel(variant)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Location">
              <select value={adjustment.branchId} onChange={(event) => setAdjustment((current) => ({ ...current, branchId: event.target.value }))}>
                {isCompanyAdmin ? <option value="">Central store</option> : null}
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Quantity change">
              <input required type="number" value={adjustment.quantityChange} onChange={(event) => setAdjustment((current) => ({ ...current, quantityChange: event.target.value }))} />
            </FormField>

            <FormField label="Reason">
              <textarea required rows="4" value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} />
            </FormField>

            <button className="primary-button" disabled={busy} type="submit">
              {busy ? 'Saving...' : 'Save adjustment'}
            </button>
          </form>
        ) : null}

        <section className="content-card">
          <div className="section-heading">
            <h3>Low stock alerts</h3>
            <p>
              {loading || branchLoading
                ? 'Loading alerts...'
                : `${lowStock.length} active alerts for ${selectedBranchName}`}
            </p>
          </div>

          {loading || branchLoading ? (
            <EmptyCard text="Loading low stock alerts..." compact />
          ) : lowStock.length === 0 ? (
            <EmptyCard text="No low stock alerts for this branch." compact />
          ) : (
            <div className="stack-list">
              {lowStock.map((item) => (
                <article key={item.productVariantId} className="list-card compact-card">
                  <strong>{item.productName}</strong>
                  <span>{item.variantDescription}</span>
                  <span>{item.currentQuantity} left, reorder point {item.reorderPoint}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="split-grid">
        <section className="content-card">
          <div className="section-heading">
            <h3>Central inventory</h3>
            <p>{loading ? 'Loading central stock...' : `${centralInventory.length} balances`}</p>
          </div>
          {loading ? <EmptyCard text="Loading central inventory..." compact /> : <InventoryList balances={centralInventory} emptyText="No central inventory balances." />}
        </section>

        <section className="content-card">
          <div className="section-heading">
            <h3>Branch inventory</h3>
            <p>Choose a branch to review its live stock.</p>
          </div>

          <FormField label="Branch">
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </FormField>

          {selectedBranchId ? <InventoryList balances={branchInventory} emptyText="No balances at this branch yet." /> : <EmptyCard text="Select a branch to load inventory." compact />}
        </section>
      </section>

      <section className="content-card">
        <div className="section-heading">
          <h3>Recent stock audits</h3>
          <p>
            {loading || branchLoading
              ? 'Loading stock audit trail...'
              : `${audits.length} recent audit records for ${selectedBranchName}`}
          </p>
        </div>

        {loading || branchLoading ? (
          <EmptyCard text="Loading stock audits..." compact />
        ) : audits.length === 0 ? (
          <EmptyCard text="No stock audit records for this branch yet." compact />
        ) : (
          <div className="stack-list">
            {audits.slice(0, 20).map((audit) => (
              <article key={audit.id} className="list-card compact-card">
                <div className="list-card-header">
                  <div>
                    <strong>{audit.productName}</strong>
                    <span>{audit.variantDescription} • {audit.auditType}</span>
                  </div>
                  <span className="status-pill subtle">{formatDate(audit.createdAt)}</span>
                </div>
                <span>
                  {audit.locationType === 'Branch' ? audit.branchName : 'Central store'} • {audit.quantityBefore} to {audit.quantityAfter}
                </span>
                <span>{audit.referenceType}{audit.referenceNumber ? ` • ${audit.referenceNumber}` : ''}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function TransfersPage({ api, session }) {
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [loading, setLoading] = useState(true)
  const [queueLoading, setQueueLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    productVariantId: '',
    fromBranchId: '',
    quantity: 1,
    notes: '',
  })

  const variants = normalizeProductVariants(products)
  const canRequestTransfer = hasUserPermission(session, PERMISSIONS.stockTransfer)
  const canApproveTransfer = hasUserPermission(session, PERMISSIONS.stockTransferApprove)
  const canReceiveTransfer = hasUserPermission(session, PERMISSIONS.stockTransferReceive)
  const canViewProducts = hasUserPermission(session, PERMISSIONS.productView)
  const canUseTransferForm = canRequestTransfer && canViewProducts
  const selectedBranchName =
    branches.find((branch) => branch.id === selectedBranchId)?.name ?? 'the selected branch'

  const loadPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const branchResult = await api.get('/branches/assigned')

      setBranches(branchResult)
      setSelectedBranchId((current) =>
        branchResult.some((branch) => branch.id === current) ? current : branchResult[0]?.id ?? '',
      )
    } catch (error) {
      setBranches([])
      setProducts([])
      setSelectedBranchId('')
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  const loadBranchProducts = useCallback(async (branchId) => {
    if (!canUseTransferForm || !branchId) {
      setProducts([])
      return
    }

    try {
      const result = await api.get(buildBranchProductsPath(branchId))
      setProducts(result.items ?? [])
    } catch (error) {
      setProducts([])
      setMessage(error.message)
    }
  }, [api, canUseTransferForm])

  const loadTransfers = useCallback(async (branchId) => {
    if (!branchId) {
      setTransfers([])
      return
    }

    setQueueLoading(true)

    try {
      setTransfers(await api.get(buildBranchTransfersPath(branchId)))
    } catch (error) {
      setTransfers([])
      setMessage(error.message)
    } finally {
      setQueueLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    if (selectedBranchId) {
      void loadBranchProducts(selectedBranchId)
      void loadTransfers(selectedBranchId)
      return
    }

    setProducts([])
    setQueueLoading(false)
    setTransfers([])
  }, [loadBranchProducts, loadTransfers, selectedBranchId])

  async function requestTransfer(event) {
    event.preventDefault()
    setBusyId('create')
    setMessage('')

    try {
      if (!selectedBranchId) {
        throw new Error('Select a branch to request a transfer.')
      }

      await api.post(buildBranchTransferCreatePath(selectedBranchId), {
        productVariantId: form.productVariantId,
        fromBranchId: form.fromBranchId || null,
        quantity: toNumber(form.quantity),
        notes: form.notes,
      })

      setForm({ productVariantId: '', fromBranchId: '', quantity: 1, notes: '' })
      await loadTransfers(selectedBranchId)
      setMessage('Transfer requested.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId('')
    }
  }

  async function progressTransfer(transfer, action) {
    setBusyId(transfer.id)
    setMessage('')

    try {
      if (action === 'approve') {
        await api.put(`/inventory/transfers/${transfer.id}/approve`, { notes: 'Approved in workspace' })
      }

      if (action === 'ship') {
        await api.put(`/inventory/transfers/${transfer.id}/ship`, { notes: 'Marked as shipped' })
      }

      if (action === 'receive') {
        await api.put(`/inventory/transfers/${transfer.id}/receive`, { notes: 'Received at destination' })
      }

      await loadTransfers(selectedBranchId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Transfers"
        title="Transfer workflow"
        description="Create branch transfers and move them through pending, approved, shipped, and received states with full traceability."
      />

      {message ? <InlineMessage text={message} tone={message === 'Transfer requested.' ? 'info' : 'error'} /> : null}

      <section className="content-card">
        <div className="section-heading">
          <h3>Branch scope</h3>
          <p>Choose the branch whose transfer queue and requests you want to manage.</p>
        </div>

        <FormField label="Branch">
          <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
            <option value="">Select branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </FormField>
      </section>

      <section className="split-grid">
        {canUseTransferForm ? (
          <form className="content-card stack-form" onSubmit={requestTransfer}>
            <div className="section-heading">
              <h3>Request transfer</h3>
              <p>
                Transfers are created for {selectedBranchName}. Leave source empty to move
                stock from the central store.
              </p>
            </div>

            <FormField label="Variant">
              <select required value={form.productVariantId} onChange={(event) => setForm((current) => ({ ...current, productVariantId: event.target.value }))}>
                <option value="">Select a variant</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {buildVariantLabel(variant)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Source">
              <select value={form.fromBranchId} onChange={(event) => setForm((current) => ({ ...current, fromBranchId: event.target.value }))}>
                <option value="">Central store</option>
                {branches
                  .filter((branch) => branch.id !== selectedBranchId)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
              </select>
            </FormField>

            <FormField label="Destination">
              <input disabled value={selectedBranchId ? selectedBranchName : 'Select a branch first'} />
            </FormField>

            <FormField label="Quantity">
              <input required type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
            </FormField>

            <FormField label="Notes">
              <textarea rows="4" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </FormField>

            <button className="primary-button" disabled={busyId === 'create' || !selectedBranchId} type="submit">
              {busyId === 'create' ? 'Saving...' : 'Request transfer'}
            </button>
          </form>
        ) : (
          <section className="content-card">
            <div className="section-heading">
              <h3>Transfer access</h3>
              <p>
                {canRequestTransfer
                  ? 'Transfer creation also requires product viewing access for variant selection.'
                  : 'This role can view transfer activity only.'}
              </p>
            </div>
            <EmptyCard
              text={
                canRequestTransfer
                  ? 'Grant product view access to enable transfer creation from this page.'
                  : 'Transfer requests are disabled for this role.'
              }
              compact
            />
          </section>
        )}

        <section className="content-card">
          <div className="section-heading">
            <h3>Transfer queue</h3>
            <p>
              {loading || queueLoading
                ? 'Loading transfers...'
                : `${transfers.length} transfer records for ${selectedBranchName}`}
            </p>
          </div>

          {loading || queueLoading ? (
            <EmptyCard text="Loading transfers..." compact />
          ) : transfers.length === 0 ? (
            <EmptyCard
              text={
                selectedBranchId
                  ? 'No transfers for this branch yet.'
                  : 'Select a branch to load transfers.'
              }
              compact
            />
          ) : (
            <div className="stack-list">
              {transfers.map((transfer) => (
                <article key={transfer.id} className="list-card spacious-card">
                  <div className="list-card-header">
                    <div>
                      <strong>{transfer.productName}</strong>
                      <span>{transfer.variantDescription} • {transfer.sku}</span>
                    </div>
                    <span className="status-pill">{transfer.status}</span>
                  </div>

                  <div className="detail-grid">
                    <DetailItem label="From" value={transfer.fromLocation} />
                    <DetailItem label="To" value={transfer.toBranchName} />
                    <DetailItem label="Quantity" value={transfer.quantity} />
                    <DetailItem label="Requested" value={formatDate(transfer.requestedAt)} />
                  </div>

                  <div className="page-actions">
                    {transfer.status === 'Pending' && canApproveTransfer ? (
                      <button type="button" className="ghost-button" disabled={busyId === transfer.id} onClick={() => progressTransfer(transfer, 'approve')}>
                        {busyId === transfer.id ? 'Working...' : 'Approve'}
                      </button>
                    ) : null}
                    {transfer.status === 'Approved' && canApproveTransfer ? (
                      <button type="button" className="ghost-button" disabled={busyId === transfer.id} onClick={() => progressTransfer(transfer, 'ship')}>
                        {busyId === transfer.id ? 'Working...' : 'Ship'}
                      </button>
                    ) : null}
                    {transfer.status === 'Shipped' && canReceiveTransfer ? (
                      <button type="button" className="ghost-button" disabled={busyId === transfer.id} onClick={() => progressTransfer(transfer, 'receive')}>
                        {busyId === transfer.id ? 'Working...' : 'Receive'}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

export function SalesPage({ api, session }) {
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [returns, setReturns] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [saleForm, setSaleForm] = useState({
    paymentMethod: 'Cash',
    customerName: '',
    customerPhoneNumber: '',
    notes: '',
  })
  const [saleLines, setSaleLines] = useState([{ ...EMPTY_SALE_LINE }])
  const [returnForm, setReturnForm] = useState({
    saleId: '',
    saleLineId: '',
    quantity: 1,
    restock: true,
    reason: '',
  })

  const isCompanyAdmin = isCompanyAdminUser(session)
  const assignedBranchIds = session?.user?.branchIds ?? []
  const hasAssignedBranchIds = assignedBranchIds.length > 0
  const selectableBranches = isCompanyAdmin
    ? branches
    : hasAssignedBranchIds
      ? branches.filter((branch) => assignedBranchIds.includes(branch.id))
      : branches
  const canCreateSale = hasUserPermission(session, PERMISSIONS.saleCreate)
  const canProcessReturn = hasUserPermission(session, PERMISSIONS.saleReturn)
  const variants = normalizeProductVariants(products)
  const emptyReturnForm = { saleId: '', saleLineId: '', quantity: 1, restock: true, reason: '' }
  const selectedSale = sales.find((sale) => sale.id === returnForm.saleId)

  const loadPage = useCallback(async () => {
    setMessage('')

    try {
      const branchResult = await api.get('/branches/assigned')

      setBranches(branchResult)

      const nextSelectableBranches = isCompanyAdmin
        ? branchResult
        : hasAssignedBranchIds
          ? branchResult.filter((branch) => assignedBranchIds.includes(branch.id))
          : branchResult

      setSelectedBranchId((current) =>
        nextSelectableBranches.some((branch) => branch.id === current)
          ? current
          : nextSelectableBranches[0]?.id ?? '',
      )
    } catch (error) {
      setMessage(error.message)
    }
  }, [api, assignedBranchIds, hasAssignedBranchIds, isCompanyAdmin])

  const loadBranchContext = useCallback(async (branchId) => {
    try {
      const [saleResult, returnResult, productResult] = await Promise.all([
        api.get(`/sales/branch/${branchId}`),
        api.get(`/sales/returns/branch/${branchId}`),
        api.get(`/products/branch/${branchId}/available?pageSize=100`),
      ])

      setSales(saleResult)
      setReturns(returnResult)
      setProducts(productResult.items ?? [])

      const availableVariantIds = new Set(
        normalizeProductVariants(productResult.items ?? []).map((variant) => variant.id),
      )

      setSaleLines((current) =>
        current.map((line) =>
          line.productVariantId && !availableVariantIds.has(line.productVariantId)
            ? { ...line, productVariantId: '' }
            : line,
        ),
      )
      setReturnForm((current) => {
        const matchingSale = saleResult.find((sale) => sale.id === current.saleId)
        if (!matchingSale) {
          return emptyReturnForm
        }

        return matchingSale.lines.some((line) => line.id === current.saleLineId)
          ? current
          : { ...current, saleLineId: '' }
      })
    } catch (error) {
      setMessage(error.message)
    }
  }, [api])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    if (selectedBranchId) {
      void loadBranchContext(selectedBranchId)
      return
    }

    setProducts([])
    setSales([])
    setReturns([])
    setReturnForm(emptyReturnForm)
  }, [loadBranchContext, selectedBranchId])

  useEffect(() => {
    if (selectedBranchId || selectableBranches.length === 0) {
      return
    }

    setSelectedBranchId(selectableBranches[0].id)
  }, [selectableBranches, selectedBranchId])

  async function logSale(event) {
    event.preventDefault()
    setBusy('sale')
    setMessage('')

    try {
      await api.post('/sales/log', {
        branchId: selectedBranchId,
        ...saleForm,
        lines: saleLines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: toNumber(line.quantity),
        })),
      })

      setSaleForm({ paymentMethod: 'Cash', customerName: '', customerPhoneNumber: '', notes: '' })
      setSaleLines([{ ...EMPTY_SALE_LINE }])
      await loadBranchContext(selectedBranchId)
      setMessage('Sale logged.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  async function submitReturn(event) {
    event.preventDefault()
    setBusy('return')
    setMessage('')

    try {
      await api.post('/sales/returns', {
        saleId: returnForm.saleId,
        saleLineId: returnForm.saleLineId,
        quantity: toNumber(returnForm.quantity),
        restock: returnForm.restock,
        reason: returnForm.reason,
      })

      setReturnForm(emptyReturnForm)
      await loadBranchContext(selectedBranchId)
      setMessage('Return processed.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Sales"
        title="POS sales and returns"
        description="Record invoice-based branch sales, then process customer returns with optional restocking."
      />

      {message ? <InlineMessage text={message} tone={message === 'Sale logged.' || message === 'Return processed.' ? 'info' : 'error'} /> : null}

      <section className="content-card">
        <FormField label="Active branch">
          <select
            value={selectedBranchId}
            disabled={!isCompanyAdmin}
            onChange={(event) => setSelectedBranchId(event.target.value)}
          >
            <option value="">Select branch</option>
            {selectableBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </FormField>
      </section>

      {canCreateSale || canProcessReturn ? (
        <section className="split-grid">
          {canCreateSale ? (
            <form className="content-card stack-form" onSubmit={logSale}>
          <div className="section-heading">
            <h3>Log sale</h3>
            <p>Create an invoice and deduct stock from the selected branch.</p>
          </div>

          <div className="input-grid">
            <FormField label="Payment method">
              <select value={saleForm.paymentMethod} onChange={(event) => setSaleForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Customer name">
              <input value={saleForm.customerName} onChange={(event) => setSaleForm((current) => ({ ...current, customerName: event.target.value }))} />
            </FormField>
            <FormField label="Customer phone">
              <input value={saleForm.customerPhoneNumber} onChange={(event) => setSaleForm((current) => ({ ...current, customerPhoneNumber: event.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <input value={saleForm.notes} onChange={(event) => setSaleForm((current) => ({ ...current, notes: event.target.value }))} />
            </FormField>
          </div>

          <div className="editor-stack">
            {saleLines.map((line, index) => (
              <article key={`sale-line-${index}`} className="editor-card">
                <div className="list-card-header">
                  <strong>Line {index + 1}</strong>
                  {saleLines.length > 1 ? (
                    <button type="button" className="ghost-button danger" onClick={() => setSaleLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="input-grid">
                  <FormField label="Variant">
                    <select
                      required
                      value={line.productVariantId}
                      onChange={(event) =>
                        setSaleLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, productVariantId: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      <option value="">Select a variant</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {buildVariantLabel(variant)}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Quantity">
                    <input
                      required
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) =>
                        setSaleLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, quantity: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </FormField>
                </div>
              </article>
            ))}
          </div>

          <div className="page-actions">
            <button type="button" className="ghost-button" onClick={() => setSaleLines((current) => [...current, { ...EMPTY_SALE_LINE }])}>
              Add line
            </button>
            <button className="primary-button" disabled={!selectedBranchId || busy === 'sale'} type="submit">
              {busy === 'sale' ? 'Saving...' : 'Log sale'}
            </button>
          </div>
            </form>
          ) : null}

          {canProcessReturn ? (
            <form className="content-card stack-form" onSubmit={submitReturn}>
          <div className="section-heading">
            <h3>Process return</h3>
            <p>Select a recorded sale line and return quantity.</p>
          </div>

          <FormField label="Sale">
            <select
              required
              value={returnForm.saleId}
              onChange={(event) =>
                setReturnForm((current) => ({ ...current, saleId: event.target.value, saleLineId: '' }))
              }
            >
              <option value="">Select sale</option>
              {sales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.invoiceNumber} • {formatDate(sale.soldAt)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Sale line">
            <select required value={returnForm.saleLineId} onChange={(event) => setReturnForm((current) => ({ ...current, saleLineId: event.target.value }))}>
              <option value="">Select line</option>
              {(selectedSale?.lines ?? []).map((line) => (
                <option key={line.id} value={line.id}>
                  {line.productName} • {line.variantDescription} • qty {line.quantity}
                </option>
              ))}
            </select>
          </FormField>

          <div className="input-grid">
            <FormField label="Quantity">
              <input required type="number" min="1" value={returnForm.quantity} onChange={(event) => setReturnForm((current) => ({ ...current, quantity: event.target.value }))} />
            </FormField>
            <FormField label="Restock">
              <select value={String(returnForm.restock)} onChange={(event) => setReturnForm((current) => ({ ...current, restock: event.target.value === 'true' }))}>
                <option value="true">Restock item</option>
                <option value="false">Do not restock</option>
              </select>
            </FormField>
          </div>

          <FormField label="Reason">
            <textarea required rows="4" value={returnForm.reason} onChange={(event) => setReturnForm((current) => ({ ...current, reason: event.target.value }))} />
          </FormField>

          <button className="primary-button" disabled={!selectedBranchId || busy === 'return'} type="submit">
            {busy === 'return' ? 'Saving...' : 'Process return'}
          </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="split-grid">
        <section className="content-card">
          <div className="section-heading">
            <h3>Recent sales</h3>
            <p>{sales.length} recorded sales</p>
          </div>
          {sales.length === 0 ? (
            <EmptyCard text="No sales for this branch yet." compact />
          ) : (
            <div className="stack-list">
              {sales.map((sale) => (
                <article key={sale.id} className="list-card spacious-card">
                  <div className="list-card-header">
                    <div>
                      <strong>{sale.invoiceNumber}</strong>
                      <span>{formatDate(sale.soldAt)}</span>
                    </div>
                    <span className="status-pill subtle">{formatCurrency(sale.totalAmount)}</span>
                  </div>
                  <div className="stack-list dense-list">
                    {sale.lines.map((line) => (
                      <article key={line.id} className="mini-row">
                        <div>
                          <strong>{line.productName}</strong>
                          <span>{line.variantDescription}</span>
                        </div>
                        <div className="mini-row-meta">
                          <span>{line.quantity} x {formatCurrency(line.unitPrice)}</span>
                          <span>{formatCurrency(line.lineTotal)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="content-card">
          <div className="section-heading">
            <h3>Recent returns</h3>
            <p>{returns.length} processed returns</p>
          </div>
          {returns.length === 0 ? (
            <EmptyCard text="No returns for this branch yet." compact />
          ) : (
            <div className="stack-list">
              {returns.map((item) => (
                <article key={item.id} className="list-card compact-card">
                  <strong>{item.productName}</strong>
                  <span>{item.variantDescription}</span>
                  <span>Qty {item.quantity} • Refund {formatCurrency(item.refundAmount)}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

export function ReportsPage({ api, session }) {
  const [stockSummary, setStockSummary] = useState([])
  const [salesByBranch, setSalesByBranch] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const canViewInventoryReport = hasUserPermission(session, PERMISSIONS.reportViewInventory)
  const canViewSalesReport = hasAnyUserPermission(session, SALES_REPORT_PERMISSIONS)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setMessage('')

      try {
        const [stockResult, salesResult] = await Promise.all([
          canViewInventoryReport ? api.get('/reports/stock-summary') : Promise.resolve([]),
          canViewSalesReport ? api.get('/reports/sales-by-branch') : Promise.resolve([]),
        ])

        if (!active) {
          return
        }

        setStockSummary(stockResult)
        setSalesByBranch(salesResult)
      } catch (error) {
        if (active) {
          setMessage(error.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [api, canViewInventoryReport, canViewSalesReport])

  function exportStockSummary() {
    exportCsv(
      'stock-summary.csv',
      ['ProductCode', 'ProductName', 'SKU', 'VariantDescription', 'Unit', 'ReorderPoint', 'CentralQuantity', 'BranchQuantity', 'TotalQuantity', 'IsLowStock'],
      stockSummary.map((item) => [
        item.productCode,
        item.productName,
        item.sku,
        item.variantDescription,
        item.unitOfMeasure,
        item.reorderPoint,
        item.centralQuantity,
        item.branchQuantity,
        item.totalQuantity,
        item.isLowStock,
      ]),
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Reports"
        title="Operational summaries"
        description="Review stock summary and branch sales performance, then export inventory data for spreadsheet workflows."
        action={
          canViewInventoryReport ? (
            <button type="button" className="ghost-button" onClick={exportStockSummary}>
              Export stock CSV
            </button>
          ) : null
        }
      />

      {message ? <InlineMessage text={message} tone="error" /> : null}

      <section className="split-grid">
        {canViewInventoryReport ? (
          <section className="content-card">
            <div className="section-heading">
              <h3>Stock summary</h3>
              <p>{loading ? 'Loading stock summary...' : `${stockSummary.length} tracked variants`}</p>
            </div>
            {loading ? <EmptyCard text="Loading stock summary..." compact /> : stockSummary.length === 0 ? <EmptyCard text="No stock summary available." compact /> : <InventoryReportList items={stockSummary} />}
          </section>
        ) : null}

        {canViewSalesReport ? (
          <section className="content-card">
            <div className="section-heading">
              <h3>Sales by branch</h3>
              <p>{loading ? 'Loading branch sales...' : `${salesByBranch.length} branches with sales`}</p>
            </div>
            {loading ? <EmptyCard text="Loading sales by branch..." compact /> : salesByBranch.length === 0 ? <EmptyCard text="No sales data yet." compact /> : <BranchSalesList items={salesByBranch} />}
          </section>
        ) : null}
      </section>
    </div>
  )
}

function InventoryList({ balances, emptyText }) {
  if (balances.length === 0) {
    return <EmptyCard text={emptyText} compact />
  }

  return (
    <div className="stack-list">
      {balances.map((balance) => (
        <article key={balance.inventoryBalanceId} className="list-card compact-card">
          <div className="list-card-header">
            <div>
              <strong>{balance.productName}</strong>
              <span>{balance.variantDescription} • {balance.sku}</span>
            </div>
            <span className={balance.isLowStock ? 'status-pill' : 'status-pill success'}>
              Live {balance.quantity} {balance.unitOfMeasure}
            </span>
          </div>
          <span>
            {balance.locationType === 'Branch' ? balance.branchName : 'Central store'} - Original {balance.originalQuantity} {balance.unitOfMeasure}
          </span>
        </article>
      ))}
    </div>
  )
}

function InventoryReportList({ items }) {
  return (
    <div className="stack-list">
      {items.map((item) => (
        <article key={item.productVariantId} className="list-card compact-card">
          <div className="list-card-header">
            <div>
              <strong>{item.productName}</strong>
              <span>{item.variantDescription} • {item.sku}</span>
            </div>
            <span className={item.isLowStock ? 'status-pill' : 'status-pill success'}>
              {item.isLowStock ? 'Low stock' : 'Healthy'}
            </span>
          </div>
          <span>Central {item.centralQuantity} • Branch {item.branchQuantity} • Total {item.totalQuantity}</span>
        </article>
      ))}
    </div>
  )
}

function BranchSalesList({ items }) {
  return (
    <div className="stack-list">
      {items.map((item) => (
        <article key={item.branchId} className="list-card compact-card">
          <strong>{item.branchName}</strong>
          <span>{item.totalQuantitySold} units • {item.transactionCount} invoices</span>
          <span>{formatCurrency(item.totalSalesValue)}</span>
        </article>
      ))}
    </div>
  )
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <section className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  )
}

function FormField({ children, label }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function InlineMessage({ text, tone }) {
  return <p className={tone === 'error' ? 'inline-message error' : 'inline-message'}>{text}</p>
}

function EmptyCard({ compact = false, text }) {
  return <section className={compact ? 'empty-card compact' : 'empty-card'}>{text}</section>
}

function StatCard({ label, note, value }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

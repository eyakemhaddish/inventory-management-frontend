import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

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

const PAYMENT_METHODS = [
  'Cash',
  'Telebirr',
  'Chapa',
  'Cbe Birr',
  'Bank Transfer',
  'Card',
  'Other',
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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

function buildSalesDashboardPath(branchId, windowKey) {
  return windowKey
    ? `/reports/sales-dashboard/${branchId}?window=${encodeURIComponent(windowKey)}`
    : `/reports/sales-dashboard/${branchId}`
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

export function CompanyDashboardPage({ api }) {
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
  const [message, setMessage] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [salesOverview, setSalesOverview] = useState(null)
  const [salesMetadataLoading, setSalesMetadataLoading] = useState(false)
  const [salesLoading, setSalesLoading] = useState(false)
  const [todaySalesLoading, setTodaySalesLoading] = useState(false)
  const [todaySalesWindow, setTodaySalesWindow] = useState(null)
  const [salesMessage, setSalesMessage] = useState('')
  const [activeSalesWindowKey, setActiveSalesWindowKey] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setMessage('')

      const [branchesResult, lowStockResult, stockSummaryResult, transfersResult] =
        await Promise.allSettled([
          api.get('/branches/assigned'),
          api.get('/inventory/low-stock'),
          api.get('/reports/stock-summary'),
          api.get('/inventory/transfers?status=Pending'),
        ])

      if (!active) {
        return
      }

      if (branchesResult.status !== 'fulfilled') {
        setAvailability({
          branches: false,
          lowStock: lowStockResult.status === 'fulfilled',
          stockSummary: stockSummaryResult.status === 'fulfilled',
          transfers: transfersResult.status === 'fulfilled',
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
        lowStock: lowStockResult.status === 'fulfilled',
        stockSummary: stockSummaryResult.status === 'fulfilled',
        transfers: transfersResult.status === 'fulfilled',
      })
      setSnapshot({
        branches: branchesResult.value,
        lowStock: lowStockResult.status === 'fulfilled' ? lowStockResult.value : [],
        stockSummary: stockSummaryResult.status === 'fulfilled' ? stockSummaryResult.value : [],
        transfers: transfersResult.status === 'fulfilled' ? transfersResult.value : [],
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
      snapshot.branches.some((branch) => branch.id === current)
        ? current
        : snapshot.branches[0]?.id ?? '',
    )
  }, [snapshot.branches])

  useEffect(() => {
    let active = true

    if (!selectedBranchId) {
      setSalesOverview(null)
      setTodaySalesWindow(null)
      setActiveSalesWindowKey('')
      setSalesMessage(
        snapshot.branches.length === 0
          ? 'Assign at least one branch to unlock branch-level sales insights.'
          : 'Select a branch to load sales insights.',
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
      <PageHeader
        eyebrow="Company workspace"
        title="Operations overview"
        description="Track inventory pressure, branch activity, and the sales windows each role is allowed to see."
      />

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
              ? `Net sales for ${salesOverview.branchName}`
              : 'Visible only when this branch has a permitted today sales window'
          }
        />
      </section>

      <section className="split-grid">
        <article className="content-card">
          <div className="section-heading">
            <h3>Immediate attention</h3>
            <p>Low stock and pending transfers that need action.</p>
          </div>

          {loading ? (
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
        </article>

        <article className="content-card">
          <div className="section-heading">
            <h3>Quick links</h3>
            <p>Jump into the operational pages.</p>
          </div>
          <div className="quick-links">
            <NavLink to="/app/company/products" className="quick-link-card">
              <strong>Products</strong>
              <span>Create products and variants</span>
            </NavLink>
            <NavLink to="/app/company/inventory" className="quick-link-card">
              <strong>Inventory</strong>
              <span>Adjust stock and review balances</span>
            </NavLink>
            <NavLink to="/app/company/transfers" className="quick-link-card">
              <strong>Transfers</strong>
              <span>Approve, ship, and receive stock</span>
            </NavLink>
            <NavLink to="/app/company/sales" className="quick-link-card">
              <strong>Sales</strong>
              <span>Log POS sales and handle returns</span>
            </NavLink>
            <NavLink to="/app/company/reports" className="quick-link-card">
              <strong>Reports</strong>
              <span>View summaries and export data</span>
            </NavLink>
          </div>
        </article>
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
              <FormField label="Branch">
                <select
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                >
                  {snapshot.branches.map((branch) => (
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
                        this branch in the selected reporting window.
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
  const highestSalesValue = Math.max(...points.map((point) => Number(point.salesValue)), 0)

  return (
    <div className="sales-chart">
      <div className="section-heading">
        <h3>Sales graph</h3>
        <p>Bar graph of branch sales for the active reporting window.</p>
      </div>

      <div className="sales-chart-scroll">
        <div className="sales-chart-grid">
          {points.map((point) => {
            const height =
              highestSalesValue === 0 ? 0 : (Number(point.salesValue) / highestSalesValue) * 100
            const visibleHeight = height === 0 ? 0 : Math.max(height, 10)

            return (
              <div key={`${point.bucketStartUtc}-${point.label}`} className="sales-chart-bar">
                <div className="sales-chart-track">
                  <div className="sales-chart-fill" style={{ height: `${visibleHeight}%` }} />
                </div>
                <div className="sales-chart-meta">
                  <strong>{point.label}</strong>
                  <span>{formatCurrency(point.salesValue)}</span>
                </div>
              </div>
            )
          })}
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

export function ProductsPage({ api }) {
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

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const result = await api.get('/products?pageSize=100')
      setProducts(result.items ?? [])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

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
      await loadProducts()
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
        variant.centralQuantity,
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
        'CentralQuantity',
        'TotalQuantity',
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
          openingQuantity: toNumber(row[indexByHeader.CentralQuantity]),
        })

        productsByCode.set(code, existing)
      }

      for (const product of productsByCode.values()) {
        await api.post('/products', product)
      }

      await loadProducts()
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
          <div className="hero-actions">
            <label className="ghost-button file-picker">
              {importing ? 'Importing...' : 'Import CSV'}
              <input type="file" accept=".csv" disabled={importing} onChange={importProducts} />
            </label>
            <button type="button" className="ghost-button" onClick={exportProducts}>
              Export CSV
            </button>
          </div>
        }
      />

      {message ? (
        <InlineMessage
          text={message}
          tone={message === 'Product created.' || message.startsWith('Imported ') ? 'info' : 'error'}
        />
      ) : null}

      <section className="split-grid">
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

        <section className="content-card">
          <div className="section-heading">
            <h3>Current catalog</h3>
            <p>{loading ? 'Loading products...' : `${products.length} products available`}</p>
          </div>

          {loading ? (
            <EmptyCard text="Loading products..." compact />
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
                          <span>Central {variant.centralQuantity} • Total {variant.totalQuantity}</span>
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

export function InventoryPage({ api }) {
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [centralInventory, setCentralInventory] = useState([])
  const [branchInventory, setBranchInventory] = useState([])
  const [audits, setAudits] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [adjustment, setAdjustment] = useState({
    productVariantId: '',
    branchId: '',
    quantityChange: '',
    reason: '',
  })

  const variants = normalizeProductVariants(products)

  const loadPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [branchResult, productResult, centralResult, lowStockResult, auditResult] = await Promise.all([
        api.get('/branches/assigned'),
        api.get('/products?pageSize=100'),
        api.get('/inventory/central'),
        api.get('/inventory/low-stock'),
        api.get('/inventory/audits'),
      ])

      setBranches(branchResult)
      setProducts(productResult.items ?? [])
      setCentralInventory(centralResult)
      setLowStock(lowStockResult)
      setAudits(auditResult)
      setSelectedBranchId(branchResult[0]?.id ?? '')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  const loadBranchInventory = useCallback(async (branchId) => {
    try {
      setBranchInventory(await api.get(`/inventory/branch/${branchId}`))
    } catch (error) {
      setMessage(error.message)
    }
  }, [api])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    if (selectedBranchId) {
      void loadBranchInventory(selectedBranchId)
    }
  }, [loadBranchInventory, selectedBranchId])

  async function submitAdjustment(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      await api.post('/inventory/adjust', {
        productVariantId: adjustment.productVariantId,
        branchId: adjustment.branchId || null,
        quantityChange: toNumber(adjustment.quantityChange),
        reason: adjustment.reason,
      })

      setAdjustment({ productVariantId: '', branchId: '', quantityChange: '', reason: '' })
      await loadPage()
      if (selectedBranchId) {
        await loadBranchInventory(selectedBranchId)
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
              <option value="">Central store</option>
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

        <section className="content-card">
          <div className="section-heading">
            <h3>Low stock alerts</h3>
            <p>{loading ? 'Loading alerts...' : `${lowStock.length} active alerts`}</p>
          </div>

          {loading ? (
            <EmptyCard text="Loading low stock alerts..." compact />
          ) : lowStock.length === 0 ? (
            <EmptyCard text="No low stock alerts." compact />
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
          <p>{loading ? 'Loading stock audit trail...' : `${audits.length} recent audit records`}</p>
        </div>

        {loading ? (
          <EmptyCard text="Loading stock audits..." compact />
        ) : audits.length === 0 ? (
          <EmptyCard text="No stock audit records yet." compact />
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

export function TransfersPage({ api }) {
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    productVariantId: '',
    fromBranchId: '',
    toBranchId: '',
    quantity: 1,
    notes: '',
  })

  const variants = normalizeProductVariants(products)

  const loadPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [branchResult, productResult, transferResult] = await Promise.all([
        api.get('/branches/assigned'),
        api.get('/products?pageSize=100'),
        api.get('/inventory/transfers'),
      ])

      setBranches(branchResult)
      setProducts(productResult.items ?? [])
      setTransfers(transferResult)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  async function requestTransfer(event) {
    event.preventDefault()
    setBusyId('create')
    setMessage('')

    try {
      await api.post('/inventory/transfer', {
        productVariantId: form.productVariantId,
        fromBranchId: form.fromBranchId || null,
        toBranchId: form.toBranchId,
        quantity: toNumber(form.quantity),
        notes: form.notes,
      })

      setForm({ productVariantId: '', fromBranchId: '', toBranchId: '', quantity: 1, notes: '' })
      await loadPage()
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

      await loadPage()
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

      <section className="split-grid">
        <form className="content-card stack-form" onSubmit={requestTransfer}>
          <div className="section-heading">
            <h3>Request transfer</h3>
            <p>Leave source empty to move stock from the central store.</p>
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
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Destination">
            <select required value={form.toBranchId} onChange={(event) => setForm((current) => ({ ...current, toBranchId: event.target.value }))}>
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Quantity">
            <input required type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
          </FormField>

          <FormField label="Notes">
            <textarea rows="4" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </FormField>

          <button className="primary-button" disabled={busyId === 'create'} type="submit">
            {busyId === 'create' ? 'Saving...' : 'Request transfer'}
          </button>
        </form>

        <section className="content-card">
          <div className="section-heading">
            <h3>Transfer queue</h3>
            <p>{loading ? 'Loading transfers...' : `${transfers.length} transfer records`}</p>
          </div>

          {loading ? (
            <EmptyCard text="Loading transfers..." compact />
          ) : transfers.length === 0 ? (
            <EmptyCard text="No transfers yet." compact />
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
                    {transfer.status === 'Pending' ? (
                      <button type="button" className="ghost-button" disabled={busyId === transfer.id} onClick={() => progressTransfer(transfer, 'approve')}>
                        {busyId === transfer.id ? 'Working...' : 'Approve'}
                      </button>
                    ) : null}
                    {transfer.status === 'Approved' ? (
                      <button type="button" className="ghost-button" disabled={busyId === transfer.id} onClick={() => progressTransfer(transfer, 'ship')}>
                        {busyId === transfer.id ? 'Working...' : 'Ship'}
                      </button>
                    ) : null}
                    {transfer.status === 'Shipped' ? (
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

  const normalizedRoleName = session?.user?.roleName?.trim().toLowerCase() ?? ''
  const isCompanyAdmin =
    normalizedRoleName === 'admin' || normalizedRoleName === 'company admin'
  const assignedBranchIds = session?.user?.branchIds ?? []
  const hasAssignedBranchIds = assignedBranchIds.length > 0
  const selectableBranches = isCompanyAdmin
    ? branches
    : hasAssignedBranchIds
      ? branches.filter((branch) => assignedBranchIds.includes(branch.id))
      : branches
  const variants = normalizeProductVariants(products)
  const selectedSale = sales.find((sale) => sale.id === returnForm.saleId)

  const loadPage = useCallback(async () => {
    setMessage('')

    try {
      const [branchResult, productResult] = await Promise.all([
        api.get('/branches/assigned'),
        api.get('/products?pageSize=100'),
      ])

      setBranches(branchResult)
      setProducts(productResult.items ?? [])

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

  const loadBranchActivity = useCallback(async (branchId) => {
    try {
      const [saleResult, returnResult] = await Promise.all([
        api.get(`/sales/branch/${branchId}`),
        api.get(`/sales/returns/branch/${branchId}`),
      ])

      setSales(saleResult)
      setReturns(returnResult)
    } catch (error) {
      setMessage(error.message)
    }
  }, [api])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    if (selectedBranchId) {
      void loadBranchActivity(selectedBranchId)
    }
  }, [loadBranchActivity, selectedBranchId])

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
      await loadBranchActivity(selectedBranchId)
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

      setReturnForm({ saleId: '', saleLineId: '', quantity: 1, restock: true, reason: '' })
      await loadBranchActivity(selectedBranchId)
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

      <section className="split-grid">
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
      </section>

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

export function ReportsPage({ api }) {
  const [stockSummary, setStockSummary] = useState([])
  const [salesByBranch, setSalesByBranch] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setMessage('')

      try {
        const [stockResult, salesResult] = await Promise.all([
          api.get('/reports/stock-summary'),
          api.get('/reports/sales-by-branch'),
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
  }, [api])

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
          <button type="button" className="ghost-button" onClick={exportStockSummary}>
            Export stock CSV
          </button>
        }
      />

      {message ? <InlineMessage text={message} tone="error" /> : null}

      <section className="split-grid">
        <section className="content-card">
          <div className="section-heading">
            <h3>Stock summary</h3>
            <p>{loading ? 'Loading stock summary...' : `${stockSummary.length} tracked variants`}</p>
          </div>
          {loading ? <EmptyCard text="Loading stock summary..." compact /> : stockSummary.length === 0 ? <EmptyCard text="No stock summary available." compact /> : <InventoryReportList items={stockSummary} />}
        </section>

        <section className="content-card">
          <div className="section-heading">
            <h3>Sales by branch</h3>
            <p>{loading ? 'Loading branch sales...' : `${salesByBranch.length} branches with sales`}</p>
          </div>
          {loading ? <EmptyCard text="Loading sales by branch..." compact /> : salesByBranch.length === 0 ? <EmptyCard text="No sales data yet." compact /> : <BranchSalesList items={salesByBranch} />}
        </section>
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

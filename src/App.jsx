import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { createApiClient } from './api'
import {
  CompanyDashboardPage,
  InventoryPage,
  ProductsPage,
  ReportsPage,
  SalesPage,
  TransfersPage,
} from './companyOperations'
import './App.css'

const SESSION_STORAGE_KEY = 'ims.session'
const REGISTRATION_STORAGE_KEY = 'ims.companyRegistration'
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/
const DEFAULT_ROLE_TEMPLATES = [
  {
    key: 'sales',
    title: 'Sales',
    accent: 'sales',
    description: 'Fast checkout, returns, and just enough inventory visibility for front-line sales teams.',
    permissionNames: [
      'sale.create',
      'sale.return',
      'sale.view_own',
      'product.view',
      'stock.view',
    ],
  },
  {
    key: 'branch-manager',
    title: 'Branch Manager',
    accent: 'manager',
    description: 'A balanced starting point for branch operations, people assignment, and performance reporting.',
    permissionNames: [
      'branch.view',
      'branch.create',
      'branch.edit',
      'product.view',
      'sale.create',
      'sale.return',
      'sale.view_all',
      'stock.view',
      'stock.transfer',
      'stock.transfer_receive',
      'user.create',
      'user.edit',
      'user.assign_role',
      'report.view_sales',
      'report.view_inventory',
    ],
  },
  {
    key: 'stock-manager',
    title: 'Stock Manager',
    accent: 'stock',
    description: 'Built for product readiness, stock movement, receiving, audits, and inventory reporting.',
    permissionNames: [
      'product.view',
      'product.create',
      'product.edit',
      'product.import',
      'product.export',
      'stock.view',
      'stock.adjust',
      'stock.transfer',
      'stock.transfer_approve',
      'stock.transfer_receive',
      'stock.audit_view',
      'report.view_inventory',
    ],
  },
]

function createLocalId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatRoleText(value) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildPermissionGroups(permissions) {
  const groups = permissions.reduce((collection, permission) => {
    const existing = collection[permission.resource] ?? []
    existing.push(permission)
    collection[permission.resource] = existing
    return collection
  }, {})

  return Object.entries(groups)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, resourcePermissions]) => ({
      resource,
      label: formatRoleText(resource),
      permissions: [...resourcePermissions].sort((left, right) =>
        left.action.localeCompare(right.action),
      ),
    }))
}

function buildRoleCoverage(permissionIds, permissionLookupById) {
  const coverage = permissionIds.reduce((collection, permissionId) => {
    const permission = permissionLookupById[permissionId]
    if (!permission) {
      return collection
    }

    collection[permission.resource] = (collection[permission.resource] ?? 0) + 1
    return collection
  }, {})

  return Object.entries(coverage)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([resource, count]) => ({
      resource,
      label: formatRoleText(resource),
      count,
    }))
}

function buildRoleComposerDraft({ template, permissionLookupByName }) {
  const permissionIds = template
    ? template.permissionNames
        .map((permissionName) => permissionLookupByName[permissionName]?.id)
        .filter(Boolean)
    : []

  return {
    id: createLocalId('role'),
    accent: template?.accent ?? 'custom',
    templateKey: template?.key ?? null,
    templateTitle: template?.title ?? 'Custom role',
    description:
      template?.description ??
      'Build a role from scratch, set the name, and select the permissions your team actually needs.',
    name: template?.title ?? '',
    permissionIds,
  }
}

function createExistingRoleDraft(role) {
  return {
    name: role.name,
    permissionIds: role.permissions.map((permission) => permission.id),
  }
}

function setGroupSelection(permissionIds, groupPermissionIds, shouldSelect) {
  const nextSelection = new Set(permissionIds)

  groupPermissionIds.forEach((permissionId) => {
    if (shouldSelect) {
      nextSelection.add(permissionId)
      return
    }

    nextSelection.delete(permissionId)
  })

  return [...nextSelection]
}

function hasSameSelections(left, right) {
  const leftSelection = new Set(left)
  const rightSelection = new Set(right)

  if (leftSelection.size !== rightSelection.size) {
    return false
  }

  return [...leftSelection].every((permissionId) => rightSelection.has(permissionId))
}

function readStorage(key) {
  const value = window.localStorage.getItem(key)
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  if (!value) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

function toggleSelection(items, item) {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item]
}

function formatDate(value) {
  if (!value) {
    return 'Not reviewed yet'
  }

  return new Date(value).toLocaleString()
}

function useStableApi(setSession) {
  const [api] = useState(() =>
    createApiClient({
      getSession: () => readStorage(SESSION_STORAGE_KEY),
      persistSession: (nextSession) => {
        writeStorage(SESSION_STORAGE_KEY, nextSession)
        setSession(nextSession)
      },
      clearSession: () => {
        writeStorage(SESSION_STORAGE_KEY, null)
        setSession(null)
      },
    }),
  )

  return api
}

function App() {
  const [session, setSession] = useState(() => readStorage(SESSION_STORAGE_KEY))
  const [registration, setRegistration] = useState(() =>
    readStorage(REGISTRATION_STORAGE_KEY),
  )
  const api = useStableApi(setSession)

  function saveRegistration(nextRegistration) {
    writeStorage(REGISTRATION_STORAGE_KEY, nextRegistration)
    setRegistration(nextRegistration)
  }

  function clearSession() {
    writeStorage(SESSION_STORAGE_KEY, null)
    setSession(null)
  }

  function saveSession(nextSession) {
    writeStorage(SESSION_STORAGE_KEY, nextSession)
    setSession(nextSession)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            session ? (
              <Navigate
                to={session.user.isSuperAdmin ? '/app/platform/companies' : '/app/company/overview'}
                replace
              />
            ) : (
              <PublicLayout />
            )
          }
        >
          <Route index element={<HomePage />} />
          <Route
            path="register"
            element={
              <RegisterPage
                api={api}
                registration={registration}
                saveRegistration={saveRegistration}
              />
            }
          />
          <Route path="login" element={<LoginPage api={api} saveSession={saveSession} />} />
        </Route>

        <Route
          path="/app"
          element={
            session ? (
              <AppLayout clearSession={clearSession} session={session} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route
            index
            element={
              <Navigate
                to={session?.user.isSuperAdmin ? '/app/platform/companies' : '/app/company/overview'}
                replace
              />
            }
          />
          <Route
            path="platform/companies"
            element={
              session?.user.isSuperAdmin ? (
                <PlatformCompaniesPage api={api} />
              ) : (
                <Navigate to="/app/company/overview" replace />
              )
            }
          />
          <Route
            path="company/overview"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <CompanyDashboardPage api={api} session={session} />
              )
            }
          />
          <Route
            path="company/products"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <ProductsPage api={api} />
              )
            }
          />
          <Route
            path="company/inventory"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <InventoryPage api={api} />
              )
            }
          />
          <Route
            path="company/transfers"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <TransfersPage api={api} />
              )
            }
          />
          <Route
            path="company/sales"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <SalesPage api={api} session={session} />
              )
            }
          />
          <Route
            path="company/reports"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <ReportsPage api={api} />
              )
            }
          />
          <Route
            path="company/branches"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <BranchesPage api={api} />
              )
            }
          />
          <Route
            path="company/roles"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <RolesPage api={api} />
              )
            }
          />
          <Route
            path="company/users"
            element={
              session?.user.isSuperAdmin ? (
                <Navigate to="/app/platform/companies" replace />
              ) : (
                <UsersPage api={api} />
              )
            }
          />
          <Route
            path="*"
            element={
              <Navigate
                to={session?.user.isSuperAdmin ? '/app/platform/companies' : '/app/company/overview'}
                replace
              />
            }
          />
        </Route>

        <Route
          path="*"
          element={
            <Navigate
              to={
                session
                  ? session.user.isSuperAdmin
                    ? '/app/platform/companies'
                    : '/app/company/overview'
                  : '/'
              }
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

function PublicLayout() {
  return (
    <div className="public-shell">
      <header className="public-header">
        <NavLink to="/" className="brand-link">
          <span className="brand-badge">IMS</span>
          <span className="brand-copy">
            <strong>Inventory Management</strong>
            <small>Multi-tenant operations console</small>
          </span>
        </NavLink>
        <nav className="public-nav">
          <SimpleNavLink to="/">Overview</SimpleNavLink>
          <SimpleNavLink to="/register">Register</SimpleNavLink>
          <SimpleNavLink to="/login">Login</SimpleNavLink>
        </nav>
      </header>
      <main className="public-main">
        <Outlet />
      </main>
    </div>
  )
}

function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Simple workflow</p>
          <h1>Register, approve, and manage company access without crowding one screen.</h1>
          <p className="lead">
            The app is split into clear pages: registration, login, superadmin approval, and separate
            company admin pages for overview, branches, roles, and users.
          </p>
          <div className="hero-actions">
            <NavLink to="/register" className="primary-link">
              Register company
            </NavLink>
            <NavLink to="/login" className="secondary-link">
              Log in
            </NavLink>
          </div>
        </div>

        <aside className="hero-card">
          <p className="eyebrow">Pages</p>
          <div className="hero-list">
            <div>
              <strong>Public</strong>
              <span>Overview, registration, login</span>
            </div>
            <div>
              <strong>Superadmin</strong>
              <span>Dedicated company approvals page</span>
            </div>
            <div>
              <strong>Company admin</strong>
              <span>Separate overview, branches, roles, and users pages</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <p className="eyebrow">Step 1</p>
          <h3>Company registration</h3>
          <p>Create the tenant and its first company admin from a clean standalone page.</p>
        </article>
        <article className="feature-card">
          <p className="eyebrow">Step 2</p>
          <h3>Superadmin approval</h3>
          <p>Review pending companies on a focused approvals page with approval notes.</p>
        </article>
        <article className="feature-card">
          <p className="eyebrow">Step 3</p>
          <h3>Access management</h3>
          <p>Use dedicated pages for branches, roles, permissions, users, and assignments.</p>
        </article>
      </section>
    </div>
  )
}

function RegisterPage({ api, registration, saveRegistration }) {
  const [form, setForm] = useState({
    companyName: '',
    subdomain: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    adminPhoneNumber: '',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (!SUBDOMAIN_PATTERN.test(form.subdomain)) {
      setMessage('Subdomain must use only lowercase letters, numbers, and hyphens.')
      return
    }

    setBusy(true)

    try {
      const result = await api.post('/onboarding/companies', form)
      saveRegistration(result)
      setForm({
        companyName: '',
        subdomain: '',
        adminFullName: '',
        adminEmail: '',
        adminPassword: '',
        adminPhoneNumber: '',
      })
      setMessage(`${result.companyName} is pending superadmin approval.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-grid">
      <section className="content-card">
        <div className="section-heading">
          <p className="eyebrow">Register company</p>
          <h2>Create a new tenant</h2>
          <p>Set up the company and its initial company admin account.</p>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          <div className="input-grid">
            <FormField label="Company name">
              <input
                required
                value={form.companyName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, companyName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Subdomain" hint="Example: eyakem-store">
              <input
                required
                value={form.subdomain}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    subdomain: event.target.value.toLowerCase(),
                  }))
                }
              />
            </FormField>
            <FormField label="Admin full name">
              <input
                required
                value={form.adminFullName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adminFullName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Admin email">
              <input
                required
                type="email"
                value={form.adminEmail}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adminEmail: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Password">
              <input
                required
                type="password"
                value={form.adminPassword}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adminPassword: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone number">
              <input
                value={form.adminPhoneNumber}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adminPhoneNumber: event.target.value }))
                }
              />
            </FormField>
          </div>

          {message ? (
            <InlineMessage
              text={message}
              tone={message.includes('pending') ? 'info' : 'error'}
            />
          ) : null}

          <div className="page-actions">
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? 'Submitting...' : 'Register company'}
            </button>
            <NavLink to="/login" className="secondary-link">
              Already approved? Log in
            </NavLink>
          </div>
        </form>
      </section>

      <aside className="content-card muted-card">
        <div className="section-heading">
          <p className="eyebrow">What happens next</p>
          <h3>Approval flow</h3>
        </div>
        <div className="step-list">
          <div>
            <strong>Registration submitted</strong>
            <p>The tenant is created with a pending status.</p>
          </div>
          <div>
            <strong>Superadmin review</strong>
            <p>The company cannot log in until a superadmin approves it.</p>
          </div>
          <div>
            <strong>Company admin access</strong>
            <p>After approval, the company admin can define roles and assign permissions.</p>
          </div>
        </div>

        {registration ? (
          <div className="summary-block">
            <p className="eyebrow">Latest registration</p>
            <strong>{registration.companyName}</strong>
            <span>{registration.companyAdminEmail}</span>
            <span>Status: {registration.status}</span>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function LoginPage({ api, saveSession }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const nextSession = await api.post('/auth/login', form)
      saveSession(nextSession)
      navigate(nextSession.user.isSuperAdmin ? '/app/platform/companies' : '/app/company/overview')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-center">
      <section className="content-card auth-card">
        <div className="section-heading">
          <p className="eyebrow">Login</p>
          <h2>Access your workspace</h2>
          <p>Company admins manage branches, roles, permissions, and users after approval.</p>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          <FormField label="Email">
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Password">
            <input
              required
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
            />
          </FormField>

          {message ? <InlineMessage text={message} tone="error" /> : null}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Signing in...' : 'Log in'}
          </button>
        </form>
      </section>
    </div>
  )
}

function AppLayout({ clearSession, session }) {
  const primaryLinks = session.user.isSuperAdmin
    ? [{ to: '/app/platform/companies', label: 'Companies' }]
    : [
        { to: '/app/company/overview', label: 'Overview' },
        { to: '/app/company/products', label: 'Products' },
        { to: '/app/company/inventory', label: 'Inventory' },
        { to: '/app/company/transfers', label: 'Transfers' },
        { to: '/app/company/sales', label: 'Sales' },
        { to: '/app/company/reports', label: 'Reports' },
        { to: '/app/company/branches', label: 'Branches' },
        { to: '/app/company/roles', label: 'Roles' },
        { to: '/app/company/users', label: 'Users' },
      ]

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-badge">IMS</span>
          <div>
            <strong>{session.user.isSuperAdmin ? 'Platform Console' : session.user.companyName}</strong>
            <small>{session.user.isSuperAdmin ? 'Superadmin' : session.user.roleName ?? 'Company Admin'}</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {primaryLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                isActive ? 'sidebar-link sidebar-link-active' : 'sidebar-link'
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-pill">{session.user.companyStatus}</span>
          <button type="button" className="ghost-button full-width" onClick={clearSession}>
            Log out
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">Current user</p>
            <h2>{session.user.fullName}</h2>
            <p>{session.user.email}</p>
          </div>
          <div className="topbar-summary">
            <span className="status-pill subtle">{session.user.companyName}</span>
            {session.user.isSuperAdmin ? <span className="status-pill success">Superadmin</span> : null}
          </div>
        </header>

        <main className="workspace-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function PlatformCompaniesPage({ api }) {
  const [filter, setFilter] = useState('Pending')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [companies, setCompanies] = useState([])
  const [reviewNotes, setReviewNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyCompanyId, setBusyCompanyId] = useState('')

  const loadCompanies = useCallback(async (nextFilter = filter) => {
    setLoading(true)
    setMessage('')

    try {
      const query = nextFilter === 'All' ? '' : `?status=${nextFilter}`
      const result = await api.get(`/platform/companies${query}`)
      startTransition(() => {
        setCompanies(result)
      })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api, filter])

  useEffect(() => {
    void loadCompanies(filter)
  }, [filter, loadCompanies])

  async function reviewCompany(companyId, approve) {
    setBusyCompanyId(companyId)
    setMessage('')

    try {
      await api.put(`/platform/companies/${companyId}/review`, {
        approve,
        notes: reviewNotes[companyId] ?? '',
      })
      await loadCompanies(filter)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyCompanyId('')
    }
  }

  const filteredCompanies = companies.filter((company) => {
    const text = `${company.name} ${company.subdomain} ${company.companyAdminEmail}`.toLowerCase()
    return text.includes(deferredSearch.trim().toLowerCase())
  })

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Superadmin"
        title="Company approvals"
        description="Review pending registrations on a dedicated page."
        action={
          <button type="button" className="ghost-button" onClick={() => loadCompanies(filter)}>
            Refresh
          </button>
        }
      />

      <section className="content-card">
        <div className="toolbar-row">
          <div className="tab-row">
            {['Pending', 'Approved', 'Rejected', 'All'].map((status) => (
              <button
                key={status}
                type="button"
                className={status === filter ? 'tab-button active' : 'tab-button'}
                onClick={() => setFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="search-wrap">
            <input
              placeholder="Search companies"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {message ? <InlineMessage text={message} tone="error" /> : null}
      </section>

      {loading ? (
        <EmptyCard text="Loading companies..." />
      ) : filteredCompanies.length === 0 ? (
        <EmptyCard text="No companies match this filter." />
      ) : (
        <section className="list-layout">
          {filteredCompanies.map((company) => (
            <article key={company.id} className="content-card company-row">
              <div className="company-row-header">
                <div>
                  <h3>{company.name}</h3>
                  <p>{company.subdomain}</p>
                </div>
                <span className="status-pill subtle">{company.status}</span>
              </div>

              <div className="detail-grid">
                <DetailItem label="Admin" value={company.companyAdminName} />
                <DetailItem label="Email" value={company.companyAdminEmail} />
                <DetailItem label="Registered" value={formatDate(company.createdAt)} />
                <DetailItem label="Reviewed" value={formatDate(company.approvedAt)} />
              </div>

              <FormField label="Review notes">
                <textarea
                  rows="3"
                  value={reviewNotes[company.id] ?? company.reviewNotes ?? ''}
                  onChange={(event) =>
                    setReviewNotes((current) => ({
                      ...current,
                      [company.id]: event.target.value,
                    }))
                  }
                />
              </FormField>

              {company.status === 'Pending' ? (
                <div className="page-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busyCompanyId === company.id}
                    onClick={() => reviewCompany(company.id, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger"
                    disabled={busyCompanyId === company.id}
                    onClick={() => reviewCompany(company.id, false)}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  )
}

function BranchesPage({ api }) {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ name: '', location: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      setBranches(await api.get('/branches'))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      await api.post('/branches', form)
      setForm({ name: '', location: '' })
      await loadBranches()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Company admin"
        title="Branches"
        description="Create and review branch locations on a dedicated page."
      />

      <section className="split-grid">
        <form className="content-card stack-form" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h3>Add branch</h3>
            <p>Create a new operational location.</p>
          </div>

          <FormField label="Branch name">
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Location">
            <input
              required
              value={form.location}
              onChange={(event) =>
                setForm((current) => ({ ...current, location: event.target.value }))
              }
            />
          </FormField>

          {message ? <InlineMessage text={message} tone="error" /> : null}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Saving...' : 'Add branch'}
          </button>
        </form>

        <section className="content-card">
          <div className="section-heading">
            <h3>Existing branches</h3>
            <p>{loading ? 'Loading branch list...' : `${branches.length} branches available`}</p>
          </div>

          {loading ? (
            <EmptyCard text="Loading branches..." compact />
          ) : branches.length === 0 ? (
            <EmptyCard text="No branches created yet." compact />
          ) : (
            <div className="stack-list">
              {branches.map((branch) => (
                <article key={branch.id} className="list-card">
                  <strong>{branch.name}</strong>
                  <span>{branch.location}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

function RolesPage({ api }) {
  const [permissions, setPermissions] = useState([])
  const [roles, setRoles] = useState([])
  const [roleDrafts, setRoleDrafts] = useState({})
  const [newRoleDrafts, setNewRoleDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activeRoleId, setActiveRoleId] = useState('')

  const loadRolesPage = useCallback(async () => {
    setLoading(true)

    try {
      const [permissionResult, roleResult] = await Promise.all([
        api.get('/admin/permissions'),
        api.get('/admin/roles'),
      ])

      startTransition(() => {
        setPermissions(permissionResult)
        setRoles(roleResult)
        setRoleDrafts(
          Object.fromEntries(roleResult.map((role) => [role.id, createExistingRoleDraft(role)])),
        )
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadRolesPage()
  }, [loadRolesPage])

  useEffect(() => {
    if (roles.length === 0) {
      setActiveRoleId('')
      return
    }

    setActiveRoleId((current) =>
      roles.some((role) => role.id === current) ? current : roles[0].id,
    )
  }, [roles])

  const permissionLookupById = permissions.reduce((lookup, permission) => {
    lookup[permission.id] = permission
    return lookup
  }, {})

  const permissionLookupByName = permissions.reduce((lookup, permission) => {
    lookup[permission.name] = permission
    return lookup
  }, {})

  const permissionGroups = buildPermissionGroups(permissions)
  const selectedTemplateKeys = new Set(
    newRoleDrafts.map((draft) => draft.templateKey).filter(Boolean),
  )
  const totalAssignedPermissions = roles.reduce(
    (total, role) => total + role.permissions.length,
    0,
  )
  const filteredRoles = roles.filter((role) => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) {
      return true
    }

    const searchableText = `${role.name} ${role.permissions
      .map((permission) => `${permission.name} ${permission.resource} ${permission.action}`)
      .join(' ')}`.toLowerCase()

    return searchableText.includes(query)
  })
  const selectedRole =
    filteredRoles.find((role) => role.id === activeRoleId) ?? filteredRoles[0] ?? null
  const selectedRoleDraft = selectedRole ? roleDrafts[selectedRole.id] : null

  function addBlankRole() {
    setNewRoleDrafts((current) => [
      ...current,
      buildRoleComposerDraft({ template: null, permissionLookupByName }),
    ])
  }

  function addTemplateRole(template) {
    setNewRoleDrafts((current) => {
      if (current.some((draft) => draft.templateKey === template.key)) {
        return current
      }

      return [
        ...current,
        buildRoleComposerDraft({
          template,
          permissionLookupByName,
        }),
      ]
    })
  }

  function updateNewRoleDraft(draftId, updater) {
    setNewRoleDrafts((current) =>
      current.map((draft) => (draft.id === draftId ? updater(draft) : draft)),
    )
  }

  function removeNewRoleDraft(draftId) {
    setNewRoleDrafts((current) => current.filter((draft) => draft.id !== draftId))
  }

  function updateExistingRoleDraft(roleId, updater) {
    setRoleDrafts((current) => ({
      ...current,
      [roleId]: updater(current[roleId] ?? { name: '', permissionIds: [] }),
    }))
  }

  async function createRole(draftId) {
    const draft = newRoleDrafts.find((item) => item.id === draftId)
    const name = draft?.name.trim() ?? ''
    if (!draft || !name) {
      setFeedback({ tone: 'error', text: 'Role name is required before saving.' })
      return
    }

    setBusy(`create:${draftId}`)
    setFeedback(null)

    try {
      await api.post('/admin/roles', {
        name,
        permissionIds: draft.permissionIds,
      })
      setNewRoleDrafts((current) => current.filter((item) => item.id !== draftId))
      await loadRolesPage()
      setFeedback({ tone: 'success', text: `${name} role created.` })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  async function updateRole(roleId) {
    const draft = roleDrafts[roleId]
    const name = draft?.name.trim() ?? ''
    if (!draft || !name) {
      setFeedback({ tone: 'error', text: 'Role name is required before saving.' })
      return
    }

    setBusy(`update:${roleId}`)
    setFeedback(null)

    try {
      await api.put(`/admin/roles/${roleId}`, {
        name,
        permissionIds: draft.permissionIds,
      })
      await loadRolesPage()
      setFeedback({ tone: 'success', text: `${name} role updated.` })
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  function roleHasChanges(role) {
    const draft = roleDrafts[role.id]
    if (!draft) {
      return false
    }

    return (
      draft.name.trim() !== role.name ||
      !hasSameSelections(
        draft.permissionIds,
        role.permissions.map((permission) => permission.id),
      )
    )
  }

  return (
    <div className="page-stack roles-page">
      <PageHeader
        eyebrow="Company admin"
        title="Role studio"
        description="Pick a starter role, tailor the name and permissions, then save a polished access setup for your company."
        action={
          <button type="button" className="primary-button" onClick={addBlankRole}>
            Add blank role
          </button>
        }
      />

      {feedback ? <InlineMessage text={feedback.text} tone={feedback.tone} /> : null}

      <section className="role-showcase">
        <article className="role-showcase-hero">
          <p className="eyebrow">Starter workflow</p>
          <h2>Launch team roles in minutes instead of building every permission set by hand.</h2>
          <p>
            Choose from Sales, Branch Manager, and Stock Manager, rename anything you want,
            fine-tune the permissions, or create a completely custom role from scratch.
          </p>
          <div className="role-chip-row">
            <span className="role-chip">Editable names</span>
            <span className="role-chip">Pre-selected permissions</span>
            <span className="role-chip">Manual custom roles</span>
          </div>
        </article>

        <div className="role-stats-panel">
          <div className="role-mini-stat">
            <span>Saved roles</span>
            <strong>{loading ? '...' : roles.length}</strong>
          </div>
          <div className="role-mini-stat">
            <span>Available permissions</span>
            <strong>{loading ? '...' : permissions.length}</strong>
          </div>
          <div className="role-mini-stat">
            <span>Role coverage</span>
            <strong>{loading ? '...' : totalAssignedPermissions}</strong>
          </div>
        </div>
      </section>

      <section className="content-card role-template-section">
        <div className="section-heading">
          <h3>Default role starters</h3>
          <p>
            Select the default roles you want to use, then edit the role name and permissions
            before saving.
          </p>
        </div>

        <div className="role-template-grid">
          {DEFAULT_ROLE_TEMPLATES.map((template) => (
            <RoleTemplateCard
              key={template.key}
              template={template}
              permissionLookupById={permissionLookupById}
              permissionLookupByName={permissionLookupByName}
              loading={loading}
              disabled={loading || permissions.length === 0}
              selected={selectedTemplateKeys.has(template.key)}
              onSelect={() => addTemplateRole(template)}
            />
          ))}
          <article className="role-template-card custom">
            <div className="role-template-card-top">
              <span className="role-template-mark custom">+</span>
              <span className="status-pill subtle">Build manually</span>
            </div>
            <div className="role-template-copy">
              <h4>Custom role</h4>
              <p>
                Start with a blank role if you need something outside the three default role
                starters.
              </p>
            </div>
            <div className="role-chip-row">
              <span className="role-chip muted">No pre-selected permissions</span>
            </div>
            <button type="button" className="ghost-button" onClick={addBlankRole}>
              Create blank role
            </button>
          </article>
        </div>
      </section>

      <section className="content-card role-builder-shell">
        <div className="section-heading">
          <h3>Role setup studio</h3>
          <p>
            Review each draft role, edit the name, and adjust permissions before you save it to
            the company.
          </p>
        </div>

        {newRoleDrafts.length === 0 ? (
          <section className="role-empty-state">
            <strong>No draft roles yet</strong>
            <p>Select one of the default roles above or start with a blank role.</p>
            <button type="button" className="ghost-button" onClick={addBlankRole}>
              Add blank role
            </button>
          </section>
        ) : (
          <div className="role-editor-list">
            {newRoleDrafts.map((draft, index) => (
              <article key={draft.id} className={`role-editor-card role-editor-card-${draft.accent}`}>
                <div className="role-editor-head">
                  <div className="role-editor-copy">
                    <span className={`role-badge role-badge-${draft.accent}`}>
                      {draft.templateKey ? `${draft.templateTitle} starter` : `Custom role ${index + 1}`}
                    </span>
                    <h3>{draft.name.trim() || 'Untitled role'}</h3>
                    <p>{draft.description}</p>
                  </div>

                  <div className="role-card-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy === `create:${draft.id}`}
                      onClick={() => removeNewRoleDraft(draft.id)}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy === `create:${draft.id}`}
                      onClick={() => createRole(draft.id)}
                    >
                      {busy === `create:${draft.id}` ? 'Creating...' : 'Create role'}
                    </button>
                  </div>
                </div>

                <FormField
                  label="Role name"
                  hint="This name can be edited before the role is saved."
                >
                  <input
                    required
                    placeholder="e.g. Downtown Sales Team"
                    value={draft.name}
                    onChange={(event) =>
                      updateNewRoleDraft(draft.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </FormField>

                <div className="role-metric-grid">
                  <div className="role-metric-card">
                    <span>Selected permissions</span>
                    <strong>{draft.permissionIds.length}</strong>
                  </div>
                  <div className="role-metric-card">
                    <span>Resource groups</span>
                    <strong>{buildRoleCoverage(draft.permissionIds, permissionLookupById).length}</strong>
                  </div>
                  <div className="role-metric-card role-metric-card-wide">
                    <span>Coverage</span>
                    <div className="role-chip-row">
                      <RoleCoverageBadges
                        permissionIds={draft.permissionIds}
                        permissionLookupById={permissionLookupById}
                      />
                    </div>
                  </div>
                </div>

                <RolePermissionGroups
                  permissionGroups={permissionGroups}
                  selectedPermissionIds={draft.permissionIds}
                  onTogglePermission={(permissionId) =>
                    updateNewRoleDraft(draft.id, (current) => ({
                      ...current,
                      permissionIds: toggleSelection(current.permissionIds, permissionId),
                    }))
                  }
                  onSetGroupSelection={(groupPermissionIds, shouldSelect) =>
                    updateNewRoleDraft(draft.id, (current) => ({
                      ...current,
                      permissionIds: setGroupSelection(
                        current.permissionIds,
                        groupPermissionIds,
                        shouldSelect,
                      ),
                    }))
                  }
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="content-card role-library-shell">
        <div className="role-library-toolbar">
          <div className="section-heading">
            <h3>Existing roles</h3>
            <p>{loading ? 'Loading roles...' : `${roles.length} roles saved for this company`}</p>
          </div>

          <FormField label="Search roles" hint="Filter by role name or permission name.">
            <input
              placeholder="Find a role"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
        </div>

        {loading ? (
          <EmptyCard text="Loading roles..." compact />
        ) : roles.length === 0 ? (
          <EmptyCard text="No roles created yet." compact />
        ) : filteredRoles.length === 0 ? (
          <EmptyCard text="No roles match your search yet." compact />
        ) : (
          <div className="role-library-grid">
            {filteredRoles.map((role) => {
              const draft = roleDrafts[role.id] ?? createExistingRoleDraft(role)
              const dirty = roleHasChanges(role)

              return (
                <button
                  key={role.id}
                  type="button"
                  className={
                    selectedRole?.id === role.id
                      ? 'role-library-card active'
                      : 'role-library-card'
                  }
                  onClick={() => setActiveRoleId(role.id)}
                >
                  <div className="role-library-card-top">
                    <span className={dirty ? 'role-library-state dirty' : 'role-library-state'}>
                      {dirty ? 'Unsaved' : 'Saved'}
                    </span>
                    <span>{draft.permissionIds.length} permissions</span>
                  </div>
                  <strong>{draft.name.trim() || 'Untitled role'}</strong>
                  <div className="role-chip-row">
                    <RoleCoverageBadges
                      permissionIds={draft.permissionIds}
                      permissionLookupById={permissionLookupById}
                      limit={3}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {selectedRole && selectedRoleDraft ? (
          <article className="role-editor-card role-editor-card-existing">
            <div className="role-editor-head">
              <div className="role-editor-copy">
                <span className="role-badge role-badge-existing">Existing role</span>
                <h3>{selectedRoleDraft.name.trim() || selectedRole.name}</h3>
                <p>Edit the role name and permissions together, then save the updated role.</p>
              </div>

              <div className="role-card-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    busy === `update:${selectedRole.id}` || !roleHasChanges(selectedRole)
                  }
                  onClick={() => updateRole(selectedRole.id)}
                >
                  {busy === `update:${selectedRole.id}` ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>

            <FormField
              label="Role name"
              hint="Renaming a role is saved together with its permission changes."
            >
              <input
                required
                value={selectedRoleDraft.name}
                onChange={(event) =>
                  updateExistingRoleDraft(selectedRole.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>

            <div className="role-metric-grid">
              <div className="role-metric-card">
                <span>Selected permissions</span>
                <strong>{selectedRoleDraft.permissionIds.length}</strong>
              </div>
              <div className="role-metric-card">
                <span>Resource groups</span>
                <strong>
                  {buildRoleCoverage(selectedRoleDraft.permissionIds, permissionLookupById).length}
                </strong>
              </div>
              <div className="role-metric-card role-metric-card-wide">
                <span>Coverage</span>
                <div className="role-chip-row">
                  <RoleCoverageBadges
                    permissionIds={selectedRoleDraft.permissionIds}
                    permissionLookupById={permissionLookupById}
                  />
                </div>
              </div>
            </div>

            <RolePermissionGroups
              permissionGroups={permissionGroups}
              selectedPermissionIds={selectedRoleDraft.permissionIds}
              onTogglePermission={(permissionId) =>
                updateExistingRoleDraft(selectedRole.id, (current) => ({
                  ...current,
                  permissionIds: toggleSelection(current.permissionIds, permissionId),
                }))
              }
              onSetGroupSelection={(groupPermissionIds, shouldSelect) =>
                updateExistingRoleDraft(selectedRole.id, (current) => ({
                  ...current,
                  permissionIds: setGroupSelection(
                    current.permissionIds,
                    groupPermissionIds,
                    shouldSelect,
                  ),
                }))
              }
            />
          </article>
        ) : null}
      </section>
    </div>
  )
}

function RoleTemplateCard({
  disabled,
  loading,
  template,
  permissionLookupById,
  permissionLookupByName,
  selected,
  onSelect,
}) {
  const permissionIds = template.permissionNames
    .map((permissionName) => permissionLookupByName[permissionName]?.id)
    .filter(Boolean)

  return (
    <article className={`role-template-card ${template.accent}`}>
      <div className="role-template-card-top">
        <span className={`role-template-mark ${template.accent}`}>
          {template.title
            .split(' ')
            .map((word) => word[0])
            .join('')
            .slice(0, 2)}
        </span>
        <span className="status-pill subtle">{permissionIds.length} permissions</span>
      </div>

      <div className="role-template-copy">
        <h4>{template.title}</h4>
        <p>{template.description}</p>
      </div>

      <div className="role-chip-row">
        <RoleCoverageBadges
          permissionIds={permissionIds}
          permissionLookupById={permissionLookupById}
        />
      </div>

      <button
        type="button"
        className="ghost-button"
        disabled={disabled || selected}
        onClick={onSelect}
      >
        {loading
          ? 'Loading...'
          : permissionIds.length === 0
            ? 'No permissions available'
            : selected
              ? 'Selected'
              : 'Use template'}
      </button>
    </article>
  )
}

function RoleCoverageBadges({
  permissionIds,
  permissionLookupById,
  emptyText = 'No permissions yet',
  limit = 4,
}) {
  const coverage = buildRoleCoverage(permissionIds, permissionLookupById)

  if (coverage.length === 0) {
    return <span className="role-chip muted">{emptyText}</span>
  }

  const visibleCoverage = coverage.slice(0, limit)

  return (
    <>
      {visibleCoverage.map((item) => (
        <span key={item.resource} className="role-chip">
          {item.label} {item.count}
        </span>
      ))}
      {coverage.length > limit ? (
        <span className="role-chip muted">+{coverage.length - limit} more</span>
      ) : null}
    </>
  )
}

function RolePermissionGroups({
  permissionGroups,
  selectedPermissionIds,
  onTogglePermission,
  onSetGroupSelection,
}) {
  return (
    <div className="role-permission-groups">
      {permissionGroups.map((group) => {
        const groupPermissionIds = group.permissions.map((permission) => permission.id)
        const selectedCount = groupPermissionIds.filter((permissionId) =>
          selectedPermissionIds.includes(permissionId),
        ).length

        return (
          <section key={group.resource} className="role-permission-group">
            <div className="role-permission-group-header">
              <div>
                <h4>{group.label}</h4>
                <p>
                  {selectedCount} of {group.permissions.length} selected
                </p>
              </div>

              <div className="role-group-actions">
                <button
                  type="button"
                  className="ghost-button role-mini-button"
                  onClick={() => onSetGroupSelection(groupPermissionIds, true)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="ghost-button role-mini-button"
                  disabled={selectedCount === 0}
                  onClick={() => onSetGroupSelection(groupPermissionIds, false)}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="role-permission-grid">
              {group.permissions.map((permission) => {
                const checked = selectedPermissionIds.includes(permission.id)

                return (
                  <label
                    key={permission.id}
                    className={checked ? 'role-toggle-card selected' : 'role-toggle-card'}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onTogglePermission(permission.id)}
                    />
                    <span className="role-toggle-copy">
                      <strong>{formatRoleText(permission.action)}</strong>
                      <small>{permission.name}</small>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function UsersPage({ api }) {
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [userDrafts, setUserDrafts] = useState({})
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    password: '',
    phoneNumber: '',
    roleId: '',
    branchIds: [],
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const loadUsersPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [roleResult, userResult, branchResult] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/users'),
        api.get('/branches'),
      ])

      setRoles(roleResult)
      setUsers(userResult)
      setBranches(branchResult)
      setUserDrafts(
        Object.fromEntries(
          userResult.map((user) => [
            user.id,
            {
              roleId: user.roleId ?? '',
              branchIds: user.branches.map((branch) => branch.id),
            },
          ]),
        ),
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadUsersPage()
  }, [loadUsersPage])

  async function createUser(event) {
    event.preventDefault()
    setBusy('create')
    setMessage('')

    try {
      await api.post('/auth/register', {
        ...form,
        roleId: form.roleId || null,
        branchIds: form.branchIds,
      })
      setForm({
        email: '',
        fullName: '',
        password: '',
        phoneNumber: '',
        roleId: '',
        branchIds: [],
      })
      await loadUsersPage()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  async function saveAssignments(userId) {
    setBusy(userId)
    setMessage('')

    try {
      const draft = userDrafts[userId]
      await api.put(`/admin/users/${userId}/role`, { roleId: draft.roleId })
      await api.put(`/admin/users/${userId}/branches`, { branchIds: draft.branchIds })
      await loadUsersPage()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Company admin"
        title="Users"
        description="Create users and update role or branch assignments on a dedicated page."
      />

      {message ? <InlineMessage text={message} tone="error" /> : null}

      <section className="split-grid">
        <form className="content-card stack-form" onSubmit={createUser}>
          <div className="section-heading">
            <h3>Create user</h3>
            <p>Add a new team member and set initial access.</p>
          </div>

          <div className="input-grid">
            <FormField label="Full name">
              <input
                required
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fullName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Password">
              <input
                required
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone number">
              <input
                value={form.phoneNumber}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phoneNumber: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Initial role">
              <select
                value={form.roleId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, roleId: event.target.value }))
                }
              >
                <option value="">No role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="pill-grid">
            {branches.map((branch) => (
              <label key={branch.id} className="toggle-pill">
                <input
                  type="checkbox"
                  checked={form.branchIds.includes(branch.id)}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      branchIds: toggleSelection(current.branchIds, branch.id),
                    }))
                  }
                />
                <span>{branch.name}</span>
              </label>
            ))}
          </div>

          <button className="primary-button" disabled={busy === 'create'} type="submit">
            {busy === 'create' ? 'Creating...' : 'Create user'}
          </button>
        </form>

        <section className="content-card">
          <div className="section-heading">
            <h3>User assignments</h3>
            <p>{loading ? 'Loading users...' : `${users.length} users available`}</p>
          </div>

          {loading ? (
            <EmptyCard text="Loading users..." compact />
          ) : users.length === 0 ? (
            <EmptyCard text="No users created yet." compact />
          ) : (
            <div className="stack-list">
              {users.map((user) => (
                <article key={user.id} className="list-card spacious-card">
                  <div className="list-card-header">
                    <div>
                      <strong>{user.fullName}</strong>
                      <span>{user.email}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy === user.id}
                      onClick={() => saveAssignments(user.id)}
                    >
                      {busy === user.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>

                  <FormField label="Role">
                    <select
                      value={userDrafts[user.id]?.roleId ?? ''}
                      onChange={(event) =>
                        setUserDrafts((current) => ({
                          ...current,
                          [user.id]: {
                            ...current[user.id],
                            roleId: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">No role</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <div className="pill-grid">
                    {branches.map((branch) => (
                      <label key={`${user.id}-${branch.id}`} className="toggle-pill">
                        <input
                          type="checkbox"
                          checked={(userDrafts[user.id]?.branchIds ?? []).includes(branch.id)}
                          onChange={() =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...current[user.id],
                                branchIds: toggleSelection(
                                  current[user.id]?.branchIds ?? [],
                                  branch.id,
                                ),
                              },
                            }))
                          }
                        />
                        <span>{branch.name}</span>
                      </label>
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

function FormField({ children, hint, label }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function InlineMessage({ text, tone }) {
  const className =
    tone === 'error'
      ? 'inline-message error'
      : tone === 'success'
        ? 'inline-message success'
        : 'inline-message'

  return <p className={className}>{text}</p>
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

function SimpleNavLink({ children, to }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? 'simple-nav-link simple-nav-link-active' : 'simple-nav-link'
      }
    >
      {children}
    </NavLink>
  )
}

export default App

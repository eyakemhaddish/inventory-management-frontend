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
                <SalesPage api={api} />
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
  const [form, setForm] = useState({ name: '', permissionIds: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const loadRolesPage = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [permissionResult, roleResult] = await Promise.all([
        api.get('/admin/permissions'),
        api.get('/admin/roles'),
      ])

      setPermissions(permissionResult)
      setRoles(roleResult)
      setRoleDrafts(
        Object.fromEntries(
          roleResult.map((role) => [role.id, role.permissions.map((permission) => permission.id)]),
        ),
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadRolesPage()
  }, [loadRolesPage])

  async function createRole(event) {
    event.preventDefault()
    setBusy('create')
    setMessage('')

    try {
      await api.post('/admin/roles', form)
      setForm({ name: '', permissionIds: [] })
      await loadRolesPage()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  async function updateRole(roleId) {
    setBusy(roleId)
    setMessage('')

    try {
      await api.put(`/admin/roles/${roleId}`, {
        permissionIds: roleDrafts[roleId] ?? [],
      })
      await loadRolesPage()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  const permissionsByResource = permissions.reduce((groups, permission) => {
    const existing = groups[permission.resource] ?? []
    existing.push(permission)
    groups[permission.resource] = existing
    return groups
  }, {})

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Company admin"
        title="Roles and permissions"
        description="Create role templates and update permission sets on a separate page."
      />

      {message ? <InlineMessage text={message} tone="error" /> : null}

      <section className="content-card">
        <div className="section-heading">
          <h3>Create role</h3>
          <p>Build a new role from the available permission groups.</p>
        </div>

        <form className="stack-form" onSubmit={createRole}>
          <FormField label="Role name">
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>

          <div className="permission-groups">
            {Object.entries(permissionsByResource).map(([resource, resourcePermissions]) => (
              <section key={resource} className="permission-group">
                <h4>{resource}</h4>
                <div className="pill-grid">
                  {resourcePermissions.map((permission) => (
                    <label key={permission.id} className="toggle-pill">
                      <input
                        type="checkbox"
                        checked={form.permissionIds.includes(permission.id)}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            permissionIds: toggleSelection(current.permissionIds, permission.id),
                          }))
                        }
                      />
                      <span>{permission.name}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <button className="primary-button" disabled={busy === 'create'} type="submit">
            {busy === 'create' ? 'Creating...' : 'Create role'}
          </button>
        </form>
      </section>

      <section className="content-card">
        <div className="section-heading">
          <h3>Existing roles</h3>
          <p>{loading ? 'Loading roles...' : `${roles.length} roles available`}</p>
        </div>

        {loading ? (
          <EmptyCard text="Loading roles..." compact />
        ) : roles.length === 0 ? (
          <EmptyCard text="No roles created yet." compact />
        ) : (
          <div className="stack-list">
            {roles.map((role) => (
              <article key={role.id} className="list-card spacious-card">
                <div className="list-card-header">
                  <div>
                    <strong>{role.name}</strong>
                    <span>{(roleDrafts[role.id] ?? []).length} permissions selected</span>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy === role.id}
                    onClick={() => updateRole(role.id)}
                  >
                    {busy === role.id ? 'Saving...' : 'Save role'}
                  </button>
                </div>

                <div className="pill-grid">
                  {permissions.map((permission) => (
                    <label key={`${role.id}-${permission.id}`} className="toggle-pill">
                      <input
                        type="checkbox"
                        checked={(roleDrafts[role.id] ?? []).includes(permission.id)}
                        onChange={() =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [role.id]: toggleSelection(current[role.id] ?? [], permission.id),
                          }))
                        }
                      />
                      <span>{permission.name}</span>
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
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

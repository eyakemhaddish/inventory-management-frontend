import {
  useCallback,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { createApiClient } from './api'
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

function AppRoutes({
  session,
  registration,
  saveSession,
  clearSession,
  saveRegistration,
  api,
}) {
  return (
    <Routes>
      <Route
        path="/"
        element={
          session ? (
            <Navigate to="/workspace" replace />
          ) : (
            <PublicHome
              api={api}
              registration={registration}
              saveRegistration={saveRegistration}
              saveSession={saveSession}
            />
          )
        }
      />
      <Route
        path="/workspace"
        element={
          session ? (
            <Workspace
              api={api}
              session={session}
              clearSession={clearSession}
            />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={session ? '/workspace' : '/'} replace />} />
    </Routes>
  )
}

function App() {
  const [session, setSession] = useState(() => readStorage(SESSION_STORAGE_KEY))
  const [registration, setRegistration] = useState(() =>
    readStorage(REGISTRATION_STORAGE_KEY),
  )

  function saveSession(nextSession) {
    writeStorage(SESSION_STORAGE_KEY, nextSession)
    setSession(nextSession)
  }

  function clearSession() {
    writeStorage(SESSION_STORAGE_KEY, null)
    setSession(null)
  }

  function saveRegistration(nextRegistration) {
    writeStorage(REGISTRATION_STORAGE_KEY, nextRegistration)
    setRegistration(nextRegistration)
  }

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

  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />
        <header className="topbar">
          <div>
            <p className="eyebrow">Inventory Management Platform</p>
            <h1>Tenant onboarding, approval, and role control in one console.</h1>
          </div>
          <nav className="topnav">
            <NavLink to="/" className="topnav-link">
              Home
            </NavLink>
            {session ? (
              <button type="button" className="ghost-button" onClick={clearSession}>
                Log out
              </button>
            ) : null}
          </nav>
        </header>

        <main className="page-content">
          <AppRoutes
            api={api}
            clearSession={clearSession}
            registration={registration}
            saveRegistration={saveRegistration}
            saveSession={saveSession}
            session={session}
          />
        </main>
      </div>
    </BrowserRouter>
  )
}

function PublicHome({ api, registration, saveRegistration, saveSession }) {
  const navigate = useNavigate()
  const [registerForm, setRegisterForm] = useState({
    companyName: '',
    subdomain: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    adminPhoneNumber: '',
  })
  const [loginForm, setLoginForm] = useState({
    email: registration?.companyAdminEmail ?? '',
    password: '',
  })
  const [registerBusy, setRegisterBusy] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [registerMessage, setRegisterMessage] = useState('')
  const [loginMessage, setLoginMessage] = useState('')

  async function handleRegister(event) {
    event.preventDefault()
    setRegisterBusy(true)
    setRegisterMessage('')

    if (!SUBDOMAIN_PATTERN.test(registerForm.subdomain)) {
      setRegisterBusy(false)
      setRegisterMessage(
        'Subdomain must be 3-50 characters and use only lowercase letters, numbers, or hyphens.',
      )
      return
    }

    try {
      const result = await api.post('/onboarding/companies', registerForm)
      saveRegistration(result)
      setRegisterMessage(
        `${result.companyName} is now pending superadmin approval. Sign in only after approval.`,
      )
      setLoginForm((current) => ({ ...current, email: result.companyAdminEmail }))
      setRegisterForm({
        companyName: '',
        subdomain: '',
        adminFullName: '',
        adminEmail: '',
        adminPassword: '',
        adminPhoneNumber: '',
      })
    } catch (error) {
      setRegisterMessage(error.message)
    } finally {
      setRegisterBusy(false)
    }
  }

  async function handleLogin(event) {
    event.preventDefault()
    setLoginBusy(true)
    setLoginMessage('')

    try {
      const nextSession = await api.post('/auth/login', loginForm)
      saveSession(nextSession)
      navigate('/workspace')
    } catch (error) {
      setLoginMessage(error.message)
    } finally {
      setLoginBusy(false)
    }
  }

  return (
    <div className="public-grid">
      <section className="hero-panel panel">
        <p className="kicker">Platform flow</p>
        <h2>Register a company, wait for approval, then let the company admin define access.</h2>
        <p className="lead">
          The backend now supports public tenant registration, superadmin review, company-admin
          sign-in, custom role creation, permission assignment, branch setup, and user onboarding.
        </p>

        <div className="timeline">
          <article>
            <span>1</span>
            <div>
              <h3>Company registers</h3>
              <p>Creates the tenant plus its first Company Admin account.</p>
            </div>
          </article>
          <article>
            <span>2</span>
            <div>
              <h3>Superadmin reviews</h3>
              <p>Pending companies stay blocked until explicitly approved.</p>
            </div>
          </article>
          <article>
            <span>3</span>
            <div>
              <h3>Company admin configures access</h3>
              <p>Roles, permissions, branches, and users are managed from the tenant console.</p>
            </div>
          </article>
        </div>

        {registration ? (
          <div className="status-card">
            <p className="status-label">Latest registration</p>
            <h3>{registration.companyName}</h3>
            <p>
              Subdomain: <strong>{registration.subdomain}</strong>
            </p>
            <p>
              Company admin email: <strong>{registration.companyAdminEmail}</strong>
            </p>
            <p>
              Status: <strong>{registration.status}</strong>
            </p>
          </div>
        ) : null}
      </section>

      <section className="forms-panel">
        <form className="panel form-card" onSubmit={handleRegister}>
          <div className="section-title-row">
            <div>
              <p className="kicker">Register company</p>
              <h3>Start tenant onboarding</h3>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>Company name</span>
              <input
                required
                value={registerForm.companyName}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    companyName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Subdomain</span>
              <input
                required
                placeholder="acme-store"
                pattern="[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$"
                value={registerForm.subdomain}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    subdomain: event.target.value.toLowerCase(),
                  }))
                }
              />
            </label>
            <label>
              <span>Company admin full name</span>
              <input
                required
                value={registerForm.adminFullName}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    adminFullName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Company admin email</span>
              <input
                required
                type="email"
                value={registerForm.adminEmail}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    adminEmail: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                required
                type="password"
                value={registerForm.adminPassword}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    adminPassword: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Phone number</span>
              <input
                value={registerForm.adminPhoneNumber}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    adminPhoneNumber: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          {registerMessage ? <p className="inline-message">{registerMessage}</p> : null}

          <button className="primary-button" disabled={registerBusy} type="submit">
            {registerBusy ? 'Submitting...' : 'Register company'}
          </button>
        </form>

        <form className="panel form-card" onSubmit={handleLogin}>
          <div className="section-title-row">
            <div>
              <p className="kicker">Sign in</p>
              <h3>Access the right workspace</h3>
            </div>
          </div>

          <div className="form-grid compact-grid">
            <label>
              <span>Email</span>
              <input
                required
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                required
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          {loginMessage ? <p className="inline-message error">{loginMessage}</p> : null}

          <button className="primary-button dark" disabled={loginBusy} type="submit">
            {loginBusy ? 'Signing in...' : 'Log in'}
          </button>
        </form>
      </section>
    </div>
  )
}

function Workspace({ api, session, clearSession }) {
  return (
    <div className="workspace-stack">
      <section className="panel workspace-header">
        <div>
          <p className="kicker">Signed in as</p>
          <h2>{session.user.fullName}</h2>
          <p className="lead">
            {session.user.isSuperAdmin
              ? 'Platform superadmin workspace'
              : `${session.user.companyName} / ${session.user.roleName ?? 'No role assigned'}`}
          </p>
        </div>
        <div className="workspace-actions">
          <div className="badge-row">
            <span className="badge">{session.user.companyStatus}</span>
            {session.user.isSuperAdmin ? <span className="badge accent">Superadmin</span> : null}
          </div>
          <button type="button" className="ghost-button" onClick={clearSession}>
            Log out
          </button>
        </div>
      </section>

      {session.user.isSuperAdmin ? (
        <SuperAdminWorkspace api={api} />
      ) : (
        <CompanyWorkspace api={api} session={session} />
      )}
    </div>
  )
}

function SuperAdminWorkspace({ api }) {
  const [filter, setFilter] = useState('Pending')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [companies, setCompanies] = useState([])
  const [reviewNotes, setReviewNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyCompanyId, setBusyCompanyId] = useState(null)

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
      setBusyCompanyId(null)
    }
  }

  const filteredCompanies = companies.filter((company) => {
    const haystack = `${company.name} ${company.subdomain} ${company.companyAdminEmail}`.toLowerCase()
    return haystack.includes(deferredSearch.trim().toLowerCase())
  })

  return (
    <section className="workspace-stack">
      <div className="panel section-panel">
        <div className="section-title-row">
          <div>
            <p className="kicker">Platform approval queue</p>
            <h3>Review company registrations</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => loadCompanies(filter)}>
            Refresh
          </button>
        </div>

        <div className="toolbar">
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
          <label className="search-field">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        {message ? <p className="inline-message error">{message}</p> : null}
      </div>

      {loading ? (
        <section className="panel empty-state">Loading companies...</section>
      ) : filteredCompanies.length === 0 ? (
        <section className="panel empty-state">No companies match this view.</section>
      ) : (
        <section className="card-grid">
          {filteredCompanies.map((company) => (
            <article className="panel company-card" key={company.id}>
              <div className="company-card-header">
                <div>
                  <p className="kicker">Tenant</p>
                  <h3>{company.name}</h3>
                </div>
                <span className="badge">{company.status}</span>
              </div>

              <dl className="company-details">
                <div>
                  <dt>Subdomain</dt>
                  <dd>{company.subdomain}</dd>
                </div>
                <div>
                  <dt>Admin</dt>
                  <dd>{company.companyAdminName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{company.companyAdminEmail}</dd>
                </div>
                <div>
                  <dt>Registered</dt>
                  <dd>{formatDate(company.createdAt)}</dd>
                </div>
                <div>
                  <dt>Reviewed</dt>
                  <dd>{formatDate(company.approvedAt)}</dd>
                </div>
              </dl>

              <label>
                <span>Review notes</span>
                <textarea
                  rows="4"
                  value={reviewNotes[company.id] ?? company.reviewNotes ?? ''}
                  onChange={(event) =>
                    setReviewNotes((current) => ({
                      ...current,
                      [company.id]: event.target.value,
                    }))
                  }
                />
              </label>

              {company.status === 'Pending' ? (
                <div className="action-row">
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
    </section>
  )
}

function CompanyWorkspace({ api, session }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [permissions, setPermissions] = useState([])
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [roleDrafts, setRoleDrafts] = useState({})
  const [userDrafts, setUserDrafts] = useState({})
  const [branchForm, setBranchForm] = useState({ name: '', location: '' })
  const [roleForm, setRoleForm] = useState({ name: '', permissionIds: [] })
  const [userForm, setUserForm] = useState({
    email: '',
    fullName: '',
    password: '',
    phoneNumber: '',
    roleId: '',
    branchIds: [],
  })

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [permissionResult, roleResult, userResult, branchResult] = await Promise.all([
        api.get('/admin/permissions'),
        api.get('/admin/roles'),
        api.get('/admin/users'),
        api.get('/branches'),
      ])

      startTransition(() => {
        setPermissions(permissionResult)
        setRoles(roleResult)
        setUsers(userResult)
        setBranches(branchResult)
        setRoleDrafts(
          Object.fromEntries(
            roleResult.map((role) => [role.id, role.permissions.map((permission) => permission.id)]),
          ),
        )
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
      })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  async function createBranch(event) {
    event.preventDefault()
    setBusyAction('branch')
    setMessage('')

    try {
      await api.post('/branches', branchForm)
      setBranchForm({ name: '', location: '' })
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyAction('')
    }
  }

  async function createRole(event) {
    event.preventDefault()
    setBusyAction('role')
    setMessage('')

    try {
      await api.post('/admin/roles', roleForm)
      setRoleForm({ name: '', permissionIds: [] })
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyAction('')
    }
  }

  async function updateRole(roleId) {
    setBusyAction(`role-${roleId}`)
    setMessage('')

    try {
      await api.put(`/admin/roles/${roleId}`, {
        permissionIds: roleDrafts[roleId] ?? [],
      })
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyAction('')
    }
  }

  async function createUser(event) {
    event.preventDefault()
    setBusyAction('user')
    setMessage('')

    try {
      await api.post('/auth/register', {
        ...userForm,
        roleId: userForm.roleId || null,
        branchIds: userForm.branchIds,
      })
      setUserForm({
        email: '',
        fullName: '',
        password: '',
        phoneNumber: '',
        roleId: '',
        branchIds: [],
      })
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyAction('')
    }
  }

  async function saveUserAssignments(userId) {
    setBusyAction(`user-${userId}`)
    setMessage('')

    try {
      const draft = userDrafts[userId]
      await api.put(`/admin/users/${userId}/role`, {
        roleId: draft.roleId,
      })
      await api.put(`/admin/users/${userId}/branches`, {
        branchIds: draft.branchIds,
      })
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyAction('')
    }
  }

  const permissionsByResource = permissions.reduce((groups, permission) => {
    const group = groups[permission.resource] ?? []
    group.push(permission)
    groups[permission.resource] = group
    return groups
  }, {})

  if (loading) {
    return <section className="panel empty-state">Loading tenant workspace...</section>
  }

  return (
    <div className="workspace-stack">
      <section className="metrics-grid">
        <article className="panel metric-card">
          <p className="kicker">Company</p>
          <h3>{session.user.companyName}</h3>
          <p>{session.user.roleName ?? 'No role assigned yet'}</p>
        </article>
        <article className="panel metric-card">
          <p className="kicker">Roles</p>
          <h3>{roles.length}</h3>
          <p>Custom access profiles</p>
        </article>
        <article className="panel metric-card">
          <p className="kicker">Users</p>
          <h3>{users.length}</h3>
          <p>Team members in this tenant</p>
        </article>
        <article className="panel metric-card">
          <p className="kicker">Branches</p>
          <h3>{branches.length}</h3>
          <p>Assignable work locations</p>
        </article>
      </section>

      {message ? <section className="panel inline-message error">{message}</section> : null}

      <section className="workspace-columns">
        <form className="panel section-panel" onSubmit={createBranch}>
          <div className="section-title-row">
            <div>
              <p className="kicker">Branches</p>
              <h3>Create operating branches</h3>
            </div>
          </div>

          <div className="form-grid compact-grid">
            <label>
              <span>Name</span>
              <input
                required
                value={branchForm.name}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Location</span>
              <input
                required
                value={branchForm.location}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, location: event.target.value }))
                }
              />
            </label>
          </div>

          <button className="primary-button" disabled={busyAction === 'branch'} type="submit">
            {busyAction === 'branch' ? 'Saving...' : 'Add branch'}
          </button>

          <div className="stack-list">
            {branches.map((branch) => (
              <article key={branch.id} className="list-card">
                <h4>{branch.name}</h4>
                <p>{branch.location}</p>
              </article>
            ))}
          </div>
        </form>

        <div className="workspace-stack">
          <form className="panel section-panel" onSubmit={createRole}>
            <div className="section-title-row">
              <div>
                <p className="kicker">Roles</p>
                <h3>Create custom role templates</h3>
              </div>
            </div>

            <label>
              <span>Role name</span>
              <input
                required
                value={roleForm.name}
                onChange={(event) =>
                  setRoleForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>

            <div className="permission-groups">
              {Object.entries(permissionsByResource).map(([resource, resourcePermissions]) => (
                <section key={resource} className="permission-group">
                  <header>
                    <h4>{resource}</h4>
                  </header>
                  <div className="pill-grid">
                    {resourcePermissions.map((permission) => (
                      <label key={permission.id} className="toggle-pill">
                        <input
                          type="checkbox"
                          checked={roleForm.permissionIds.includes(permission.id)}
                          onChange={() =>
                            setRoleForm((current) => ({
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

            <button className="primary-button" disabled={busyAction === 'role'} type="submit">
              {busyAction === 'role' ? 'Creating...' : 'Create role'}
            </button>
          </form>

          <section className="panel section-panel">
            <div className="section-title-row">
              <div>
                <p className="kicker">Role editor</p>
                <h3>Adjust existing role permissions</h3>
              </div>
            </div>

            <div className="stack-list">
              {roles.map((role) => (
                <article key={role.id} className="list-card spacious-card">
                  <div className="list-card-header">
                    <div>
                      <h4>{role.name}</h4>
                      <p>{role.permissions.length} permissions selected</p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busyAction === `role-${role.id}`}
                      onClick={() => updateRole(role.id)}
                    >
                      {busyAction === `role-${role.id}` ? 'Saving...' : 'Save role'}
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
          </section>
        </div>
      </section>

      <section className="workspace-columns wide-columns">
        <form className="panel section-panel" onSubmit={createUser}>
          <div className="section-title-row">
            <div>
              <p className="kicker">Users</p>
              <h3>Create company users</h3>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>Full name</span>
              <input
                required
                value={userForm.fullName}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, fullName: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Email</span>
              <input
                required
                type="email"
                value={userForm.email}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                required
                type="password"
                value={userForm.password}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Phone number</span>
              <input
                value={userForm.phoneNumber}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, phoneNumber: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Initial role</span>
              <select
                value={userForm.roleId}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, roleId: event.target.value }))
                }
              >
                <option value="">No role yet</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pill-grid">
            {branches.map((branch) => (
              <label key={branch.id} className="toggle-pill">
                <input
                  type="checkbox"
                  checked={userForm.branchIds.includes(branch.id)}
                  onChange={() =>
                    setUserForm((current) => ({
                      ...current,
                      branchIds: toggleSelection(current.branchIds, branch.id),
                    }))
                  }
                />
                <span>{branch.name}</span>
              </label>
            ))}
          </div>

          <button className="primary-button dark" disabled={busyAction === 'user'} type="submit">
            {busyAction === 'user' ? 'Creating...' : 'Create user'}
          </button>
        </form>

        <section className="panel section-panel">
          <div className="section-title-row">
            <div>
              <p className="kicker">Assignments</p>
              <h3>Update roles and branch access</h3>
            </div>
          </div>

          <div className="stack-list">
            {users.map((user) => (
              <article key={user.id} className="list-card spacious-card">
                <div className="list-card-header">
                  <div>
                    <h4>{user.fullName}</h4>
                    <p>{user.email}</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busyAction === `user-${user.id}`}
                    onClick={() => saveUserAssignments(user.id)}
                  >
                    {busyAction === `user-${user.id}` ? 'Saving...' : 'Save assignments'}
                  </button>
                </div>

                <label>
                  <span>Role</span>
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
                </label>

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
        </section>
      </section>
    </div>
  )
}

export default App

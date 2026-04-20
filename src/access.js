export const PERMISSIONS = {
  productView: 'product.view',
  stockView: 'stock.view',
  stockTransferView: 'stock.transfer_view',
  stockTransfer: 'stock.transfer',
  stockTransferApprove: 'stock.transfer_approve',
  stockTransferReceive: 'stock.transfer_receive',
  saleCreate: 'sale.create',
  saleReturn: 'sale.return',
  saleViewOwn: 'sale.view_own',
  saleViewAll: 'sale.view_all',
  branchView: 'branch.view',
  branchCreate: 'branch.create',
  branchEdit: 'branch.edit',
  userCreate: 'user.create',
  userAssignRole: 'user.assign_role',
  reportViewSales: 'report.view_sales',
  reportViewSalesAllBranches: 'report.view_sales_all_branches',
  reportViewInventory: 'report.view_inventory',
}

const ADMIN_ROLE_NAMES = new Set(['admin', 'company admin'])

const COMPANY_PAGE_PERMISSION_RULES = {
  overview: [],
  products: [PERMISSIONS.productView],
  inventory: [PERMISSIONS.stockView],
  transfers: [PERMISSIONS.stockTransferView],
  sales: [PERMISSIONS.saleViewOwn, PERMISSIONS.saleViewAll],
  reports: [PERMISSIONS.reportViewInventory, PERMISSIONS.reportViewSales],
  branches: [PERMISSIONS.branchView],
  roles: [PERMISSIONS.userAssignRole],
  users: [PERMISSIONS.userAssignRole],
}

export function isCompanyAdminUser(session) {
  if (session?.user?.isSuperAdmin) {
    return true
  }

  const normalizedRoleName = session?.user?.roleName?.trim().toLowerCase() ?? ''
  return ADMIN_ROLE_NAMES.has(normalizedRoleName)
}

export function hasUserPermission(session, permissionName) {
  if (!permissionName) {
    return true
  }

  if (isCompanyAdminUser(session)) {
    return true
  }

  const permissionNames = session?.user?.permissionNames
  return Array.isArray(permissionNames) && permissionNames.includes(permissionName)
}

export function hasAnyUserPermission(session, permissionNames) {
  return permissionNames.some((permissionName) => hasUserPermission(session, permissionName))
}

export function canAccessCompanyPage(session, pageKey) {
  const permissionNames = COMPANY_PAGE_PERMISSION_RULES[pageKey] ?? []
  return permissionNames.length === 0 || hasAnyUserPermission(session, permissionNames)
}

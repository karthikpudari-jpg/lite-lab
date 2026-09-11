// Client-side roles (assigned to ClientUser accounts, scoped to one client).
const ROLES = {
  ADMIN: 'ADMIN',
  FRONT_OFFICE: 'FRONT_OFFICE',
  LAB_USER: 'LAB_USER',
  MANAGER: 'MANAGER',
  MASTER_MANAGER: 'MASTER_MANAGER',
};

const ALL_ROLES = Object.values(ROLES);

// Chief-Admin-side roles (assigned to ChiefAdmin accounts - SaaS operator staff).
// ADMIN reuses the same Role row/name as the client-side ADMIN role; it is a
// distinct grant in practice because ChiefAdmin and ClientUser are separate
// account types checked by separate middleware, never interchangeable.
const CHIEF_ADMIN_ROLES = {
  ADMIN: 'ADMIN',
  MARKETING: 'MARKETING',
};

const ALL_CHIEF_ADMIN_ROLES = Object.values(CHIEF_ADMIN_ROLES);

module.exports = { ROLES, ALL_ROLES, CHIEF_ADMIN_ROLES, ALL_CHIEF_ADMIN_ROLES };

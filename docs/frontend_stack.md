# Frontend Stack Reference

Custom React admin panel for Meraki Wedding Planner, built on **Refine v5** with a Shadcn-style component library. Deployed as a separate container (`react-frontend`) that proxies API calls to the ERPNext backend.

## Tech Stack

| Layer | Library | Version |
|-------|---------|---------|
| Framework | React | 19.2 |
| Admin Framework | @refinedev/core | 5.0.8 |
| Router | react-router (v7) | 7.13 |
| Router Binding | @refinedev/react-router | 2.0.3 |
| State / Cache | @tanstack/react-query | 5.90 |
| Styling | TailwindCSS | 3.4 |
| Components | Shadcn-style (Radix UI primitives) | - |
| Icons | lucide-react | 0.460 |
| Charts | recharts | 2.15 |
| Build | Vite | 7.2 |
| TypeScript | ~5.9 |

## Refine v5 API Quirks

This is the most important section. Refine v5 has a different return shape than what you might expect from docs or older versions.

### useList

Returns `{ result, query }` -- **not** `{ data, isLoading }`.

```tsx
const { result, query } = useList({
  resource: "Employee",
  pagination: { mode: "off" },
  meta: { fields: ["name", "employee_name", "status"] },
});

const employees = result?.data ?? [];    // array of records
const total = result?.total;             // total count (if paginated)
const isLoading = query.isLoading;       // loading state from react-query
const refetch = query.refetch;           // refetch function
```

### useOne

Returns `{ result, query }` where `result` is the record directly (not wrapped in `{ data }`).

```tsx
const { result: employee, query } = useOne({
  resource: "Employee",
  id: "HR-EMP-00001",
  meta: { fields: ["name", "employee_name", "department"] },
});

// result IS the record:
console.log(employee?.employee_name);    // "Xu Test"
console.log(query.isLoading);           // boolean
```

### useCreate / useUpdate

Return `{ mutate, mutateAsync }`. There is **no `isLoading`** on the return object. Track saving state manually.

```tsx
const { mutateAsync: updateAsync } = useUpdate();
const [saving, setSaving] = useState(false);

const handleSave = async () => {
  setSaving(true);
  try {
    await updateAsync({ resource: "Employee", id: empId, values: formData });
  } finally {
    setSaving(false);
  }
};
```

```tsx
const { mutateAsync: createDoc } = useCreate();
await createDoc({ resource: "Lead", values: { ... } });
```

### useGetIdentity

Returns `{ data }` where data matches what `authProvider.getIdentity()` returns.

```tsx
const { data: identity } = useGetIdentity<{ email: string }>();
const email = identity?.email;
```

### usePermissions

Returns `{ data, isLoading }` where data is what `authProvider.getPermissions()` returns (a `string[]` of role names).

```tsx
const { data: roles, isLoading } = usePermissions<string[]>({});
const userRoles = roles ?? [];
```

### useLogin / useLogout

```tsx
const { mutate: login } = useLogin();
login({ username, password }, { onSuccess: () => {}, onError: () => {} });

const { mutate: logout } = useLogout({});
logout();
```

### useIsAuthenticated

```tsx
const { data: authData, isLoading } = useIsAuthenticated();
if (authData?.authenticated) { ... }
```

### meta.fields

All data hooks accept `meta: { fields: [...] }` which maps to the Frappe API `fields` parameter. If omitted, the data provider defaults to `["name"]`.

```tsx
useList({
  resource: "Employee",
  meta: { fields: ["name", "employee_name", "department", "status"] },
});
```

### pagination

- `pagination: { mode: "off" }` -- fetch all records (sets `limit_page_length=0`)
- `pagination: { currentPage: 1, pageSize: 20 }` -- standard pagination
- Default is page 1, size 20

### filters

Filters use Refine's operator syntax, mapped to Frappe operators in the data provider:

```tsx
filters: [
  { field: "status", operator: "eq", value: "Active" },
  { field: "customer_name", operator: "contains", value: "search term" },
]
```

| Refine Operator | Frappe Operator |
|-----------------|-----------------|
| eq | = |
| ne | != |
| gt, gte, lt, lte | >, >=, <, <= |
| contains | like (%value%) |
| in | in |

### queryOptions

Pass `queryOptions: { enabled: false }` to conditionally disable a query (useful for dependent queries).

```tsx
const { result } = useOne({
  resource: "Employee",
  id: employeeId ?? "",
  queryOptions: { enabled: !!employeeId },  // only fetch when ID is available
});
```

## Architecture

### Directory Structure

```
refinefrontend/src/
  App.tsx                   # Routes, Refine config, guards
  main.tsx                  # Entry point
  index.css                 # Tailwind + CSS variables

  providers/
    authProvider.ts          # Frappe login/logout/identity/roles
    dataProvider.ts          # Frappe REST API adapter
    accessControlProvider.ts # Role-based resource access

  lib/
    roles.ts                # Role constants, module config, role helpers
    types.ts                # TypeScript interfaces for ERPNext doctypes
    format.ts               # formatVND(), formatDate()
    utils.ts                # cn() (tailwind-merge + clsx)

  components/
    Layout.tsx              # Admin layout (sidebar + outlet)
    SelfServiceLayout.tsx   # ESS layout (top bar + outlet, no sidebar)
    MetricCard.tsx          # Dashboard metric card
    ui/                     # Shadcn-style primitives (badge, button, card, etc.)

  hooks/
    useMyEmployee.ts        # Find & fetch Employee record for logged-in user

  pages/
    LoginPage.tsx
    DashboardPage.tsx
    crm/                    # Customers, Weddings, Leads, Opportunities
    hr/                     # Employees, Leaves, Onboarding
    finance/                # Invoices, Journals, Overview
    self-service/           # MyProfilePage (employee onboarding)
```

### Routing

Two authenticated route branches in `App.tsx`:

1. **Admin branch** (pathless layout route) -- uses `<Layout />` with sidebar, guarded by `AdminGuard` which redirects ESS-only users.
2. **Self-service branch** (`/my-profile`) -- uses `<SelfServiceLayout />` with top bar only, no sidebar.

The index route (`/`) renders `<RoleRedirect />` which checks roles:
- ESS-only user -> redirect to `/my-profile`
- Admin/manager -> render `<DashboardPage />`

Catch-all `*` route redirects to `/`.

### Role System

Defined in `roles.ts`:

| Constant | Roles |
|----------|-------|
| `CRM_ROLES` | System Manager, Sales Manager, Sales User |
| `HR_ROLES` | System Manager, HR Manager, HR User |
| `FINANCE_ROLES` | System Manager, Accounts Manager, Accounts User |

Key functions:
- `hasModuleAccess(userRoles, moduleRoles)` -- checks if user can see a sidebar module (Administrator bypasses)
- `isEmployeeSelfServiceOnly(roles)` -- returns true if user has "Employee Self Service" but no admin/manager roles

### Authentication Flow

1. Login: POST to `/api/method/login` with `usr`/`pwd` (form-urlencoded)
2. Session: Cookie-based (`credentials: "include"` on all requests)
3. Identity check: GET `/api/method/frappe.auth.get_logged_user`
4. Roles: GET `/api/method/frappe.core.doctype.user.user.get_roles?uid=<email>`
5. All requests include header `X-Frappe-Site-Name: erp.merakiwp.com`

### Data Provider

Custom adapter in `dataProvider.ts` translating Refine CRUD calls to Frappe REST API:

| Refine Method | HTTP | Frappe Endpoint |
|---------------|------|-----------------|
| getList | GET | `/api/resource/{doctype}?fields=...&filters=...` |
| getOne | GET | `/api/resource/{doctype}/{id}` |
| create | POST | `/api/resource/{doctype}` |
| update | PUT | `/api/resource/{doctype}/{id}` |
| deleteOne | DELETE | `/api/resource/{doctype}/{id}` |

All responses follow Frappe format: `{ data: ... }` for single records, `{ data: [...] }` for lists.

## UI Components

Shadcn-style components in `components/ui/`. These are **not** installed from a package -- they are local source files built on Radix UI primitives + TailwindCSS.

### Available Components

| Component | File | Notes |
|-----------|------|-------|
| Badge | `ui/badge.tsx` | Variants: default, secondary, destructive, outline, success, warning, info |
| Button | `ui/button.tsx` | Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, icon |
| Card | `ui/card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Dialog | `ui/dialog.tsx` | Radix Dialog primitives |
| Input | `ui/input.tsx` | Standard text input |
| Label | `ui/label.tsx` | Form label |
| Select | `ui/select.tsx` | Radix Select with trigger, content, item |
| Separator | `ui/separator.tsx` | Horizontal/vertical separator |
| Sidebar | `ui/sidebar.tsx` | Custom sidebar with collapsible state via SidebarProvider/useSidebar |
| Table | `ui/table.tsx` | Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| Tabs | `ui/tabs.tsx` | Radix Tabs primitives |
| Textarea | `ui/textarea.tsx` | Multiline text input |

### Adding New Components

Follow the existing pattern. Each component:
1. Uses Radix UI primitive (if interactive)
2. Styled with `cva` (class-variance-authority) for variants
3. Uses `cn()` from `lib/utils.ts` for class merging
4. Exports named components (not default)

### CSS Variables

Theme colors are defined in `index.css` as HSL values:

```css
--background, --foreground, --card, --primary, --secondary,
--muted, --accent, --destructive, --border, --input, --ring
--sidebar-background, --sidebar-foreground, --sidebar-primary, etc.
```

## Deployment

### Docker

The frontend builds as a two-stage Docker image:
1. **Builder stage**: `node:20-alpine`, runs `npm ci` + `npm run build` (tsc + vite)
2. **Runtime stage**: `nginx:alpine`, serves static files from `/usr/share/nginx/html`

### Nginx Config

Listens on port **8090**. Three location blocks:
- `/` -- serves SPA with `try_files` fallback to `index.html`
- `/api/` -- proxies to ERPNext frontend container (`erpnext-frontend:8080`)
- `/assets/frappe/`, `/assets/erpnext/` -- proxies ERPNext static assets

### Docker Compose

Defined in `docker-compose.local.yml` as `react-frontend` service:
- Accessible at `http://frontend.merakierp.loc` via Traefik
- Depends on the ERPNext `frontend` service
- Connected to both default network and Traefik network

### Build & Deploy Commands

```bash
# Build
docker compose -f docker-compose.yml -f docker-compose.local.yml build react-frontend

# Deploy
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend -d

# Build + deploy in one step
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```

### Path Alias

Vite is configured with `@` -> `./src` alias in `vite.config.ts`. All imports use `@/` prefix:

```tsx
import { Button } from "@/components/ui/button";
import { formatVND } from "@/lib/format";
```

## Conventions

### Page Pattern

Each page is a default export in its module directory:

```tsx
// pages/hr/EmployeesPage.tsx
export default function EmployeesPage() {
  const { result, query } = useList({ ... });
  const data = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Page Title</h1>
      <Card>...</Card>
    </div>
  );
}
```

### Detail Page Pattern

Uses `:name` param (not `:id`) since ERPNext uses `name` as primary key:

```tsx
export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>();
  const { result: employee } = useOne({ resource: "Employee", id: name! });
  // ...
}
```

### Resource Names

Resources use ERPNext doctype names with spaces:

```
"Customer", "Sales Order", "Lead", "Opportunity",
"Employee", "Leave Application", "Employee Onboarding",
"Sales Invoice", "Journal Entry"
```

### Formatting

- Currency: `formatVND(amount)` -- returns Vietnamese Dong formatted string
- Dates: `formatDate(dateStr)` -- returns "DD Mon YYYY" format (e.g., "05 Jan 2024")

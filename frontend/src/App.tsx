import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CRM_ROLES, HR_ROLES, FINANCE_ROLES } from "@/lib/roles";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/crm/CustomersPage";
import CustomerDetailPage from "@/pages/crm/CustomerDetailPage";
import WeddingsPage from "@/pages/crm/WeddingsPage";
import WeddingDetailPage from "@/pages/crm/WeddingDetailPage";
import LeadsPage from "@/pages/crm/LeadsPage";
import LeadDetailPage from "@/pages/crm/LeadDetailPage";
import OpportunitiesPage from "@/pages/crm/OpportunitiesPage";
import OpportunityDetailPage from "@/pages/crm/OpportunityDetailPage";
import EmployeesPage from "@/pages/hr/EmployeesPage";
import EmployeeDetailPage from "@/pages/hr/EmployeeDetailPage";
import LeavesPage from "@/pages/hr/LeavesPage";
import OnboardingPage from "@/pages/hr/OnboardingPage";
import OnboardingDetailPage from "@/pages/hr/OnboardingDetailPage";
import InvoicesPage from "@/pages/finance/InvoicesPage";
import InvoiceDetailPage from "@/pages/finance/InvoiceDetailPage";
import JournalsPage from "@/pages/finance/JournalsPage";
import OverviewPage from "@/pages/finance/OverviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />

        {/* CRM */}
        <Route path="/crm/customers" element={<ProtectedRoute requiredRoles={CRM_ROLES}><CustomersPage /></ProtectedRoute>} />
        <Route path="/crm/customers/:name" element={<ProtectedRoute requiredRoles={CRM_ROLES}><CustomerDetailPage /></ProtectedRoute>} />
        <Route path="/crm/weddings" element={<ProtectedRoute requiredRoles={CRM_ROLES}><WeddingsPage /></ProtectedRoute>} />
        <Route path="/crm/weddings/:name" element={<ProtectedRoute requiredRoles={CRM_ROLES}><WeddingDetailPage /></ProtectedRoute>} />
        <Route path="/crm/leads" element={<ProtectedRoute requiredRoles={CRM_ROLES}><LeadsPage /></ProtectedRoute>} />
        <Route path="/crm/leads/:name" element={<ProtectedRoute requiredRoles={CRM_ROLES}><LeadDetailPage /></ProtectedRoute>} />
        <Route path="/crm/opportunities" element={<ProtectedRoute requiredRoles={CRM_ROLES}><OpportunitiesPage /></ProtectedRoute>} />
        <Route path="/crm/opportunities/:name" element={<ProtectedRoute requiredRoles={CRM_ROLES}><OpportunityDetailPage /></ProtectedRoute>} />

        {/* HR */}
        <Route path="/hr/employees" element={<ProtectedRoute requiredRoles={HR_ROLES}><EmployeesPage /></ProtectedRoute>} />
        <Route path="/hr/employees/:name" element={<ProtectedRoute requiredRoles={HR_ROLES}><EmployeeDetailPage /></ProtectedRoute>} />
        <Route path="/hr/leaves" element={<ProtectedRoute requiredRoles={HR_ROLES}><LeavesPage /></ProtectedRoute>} />
        <Route path="/hr/onboarding" element={<ProtectedRoute requiredRoles={HR_ROLES}><OnboardingPage /></ProtectedRoute>} />
        <Route path="/hr/onboarding/:name" element={<ProtectedRoute requiredRoles={HR_ROLES}><OnboardingDetailPage /></ProtectedRoute>} />

        {/* Finance */}
        <Route path="/finance/invoices" element={<ProtectedRoute requiredRoles={FINANCE_ROLES}><InvoicesPage /></ProtectedRoute>} />
        <Route path="/finance/invoices/:name" element={<ProtectedRoute requiredRoles={FINANCE_ROLES}><InvoiceDetailPage /></ProtectedRoute>} />
        <Route path="/finance/journals" element={<ProtectedRoute requiredRoles={FINANCE_ROLES}><JournalsPage /></ProtectedRoute>} />
        <Route path="/finance/overview" element={<ProtectedRoute requiredRoles={FINANCE_ROLES}><OverviewPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

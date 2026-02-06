import { Refine, Authenticated, usePermissions } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { dataProvider } from "@/providers/dataProvider";
import { authProvider } from "@/providers/authProvider";
import { accessControlProvider } from "@/providers/accessControlProvider";
import { Layout } from "@/components/Layout";
import { SelfServiceLayout } from "@/components/SelfServiceLayout";
import { ThemeProvider } from "@/context/theme-context";
import { isEmployeeSelfServiceOnly } from "@/lib/roles";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import LeadDetailPage from "@/pages/crm/LeadDetailPage";
import OpportunityDetailPage from "@/pages/crm/OpportunityDetailPage";
import KanbanPage from "@/pages/crm/KanbanPage";
import ChatsPage from "@/pages/crm/ChatsPage";
import EmployeesPage from "@/pages/hr/EmployeesPage";
import EmployeeDetailPage from "@/pages/hr/EmployeeDetailPage";
import LeavesPage from "@/pages/hr/LeavesPage";
import PayrollPage from "@/pages/hr/PayrollPage";
import OnboardingPage from "@/pages/hr/OnboardingPage";
import OnboardingDetailPage from "@/pages/hr/OnboardingDetailPage";
import RecruitingScannerPage from "@/pages/hr/RecruitingScannerPage";
import RecruitingPipelinePage from "@/pages/hr/RecruitingPipelinePage";
import ApplicantDetailPage from "@/pages/hr/ApplicantDetailPage";
import ApplicantsListPage from "@/pages/hr/ApplicantsListPage";
import InterviewSchedulingPage from "@/pages/hr/InterviewSchedulingPage";
import InvoicesPage from "@/pages/finance/InvoicesPage";
import InvoiceDetailPage from "@/pages/finance/InvoiceDetailPage";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import ExpenseDetailPage from "@/pages/finance/ExpenseDetailPage";
import PaymentsPage from "@/pages/finance/PaymentsPage";
import PaymentDetailPage from "@/pages/finance/PaymentDetailPage";
import JournalsPage from "@/pages/finance/JournalsPage";
import OverviewPage from "@/pages/finance/OverviewPage";
import MyProfilePage from "@/pages/self-service/MyProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RoleRedirect() {
  const { data: roles, isLoading, isError } = usePermissions<string[]>({});
  if (isLoading) return null;
  if (isError || !roles || roles.length === 0) {
    return <Navigate to="/login" replace />;
  }
  if (isEmployeeSelfServiceOnly(roles)) {
    return <Navigate to="/my-profile" replace />;
  }
  return <DashboardPage />;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: roles, isLoading, isError } = usePermissions<string[]>({});
  if (isLoading) return null;
  if (isError || !roles || roles.length === 0) {
    return <Navigate to="/login" replace />;
  }
  if (isEmployeeSelfServiceOnly(roles)) {
    return <Navigate to="/my-profile" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Refine
          dataProvider={dataProvider}
          authProvider={authProvider}
          accessControlProvider={accessControlProvider}
          routerProvider={routerProvider}
          resources={[
            { name: "Lead", list: "/crm", show: "/crm/leads/:id" },
            { name: "Opportunity", list: "/crm", show: "/crm/opportunities/:id" },
            { name: "Job Applicant", list: "/hr/recruiting", show: "/hr/recruiting/:id" },
            { name: "Job Opening" },
            { name: "Interview", list: "/hr/recruiting/interviews" },
            { name: "Interview Round" },
            { name: "Interview Detail" },
            { name: "Employee", list: "/hr/employees", show: "/hr/employees/:id" },
            { name: "Leave Application", list: "/hr/leaves" },
            { name: "Employee Onboarding", list: "/hr/onboarding", show: "/hr/onboarding/:id" },
            { name: "Payroll Entry", list: "/hr/payroll" },
            { name: "Salary Slip", list: "/hr/payroll" },
            { name: "Sales Invoice", list: "/finance/invoices", show: "/finance/invoices/:id" },
            { name: "Payment Entry", list: "/finance/payments", show: "/finance/payments/:id" },
            { name: "Purchase Invoice", list: "/finance/expenses", show: "/finance/expenses/:id" },
            { name: "Journal Entry", list: "/finance/journals" },
          ]}
          options={{ syncWithLocation: true, disableTelemetry: true }}
        >
          <Routes>
            <Route path="/login" element={<ThemeProvider><LoginPage /></ThemeProvider>} />

            {/* Self-service: employee profile (no sidebar) */}
            <Route
              path="/my-profile"
              element={
                <Authenticated key="self-service" fallback={<Navigate to="/login" />}>
                  <SelfServiceLayout />
                </Authenticated>
              }
            >
              <Route index element={<MyProfilePage />} />
            </Route>

            {/* Admin: full app with sidebar */}
            <Route
              element={
                <Authenticated key="main" fallback={<Navigate to="/login" />}>
                  <AdminGuard>
                    <Layout />
                  </AdminGuard>
                </Authenticated>
              }
            >
              <Route index element={<RoleRedirect />} />

              {/* CRM */}
              <Route path="/crm" element={<KanbanPage />} />
              <Route path="/crm/chats" element={<ChatsPage />} />
              <Route path="/crm/leads/:name" element={<LeadDetailPage />} />
              <Route path="/crm/opportunities/:name" element={<OpportunityDetailPage />} />

              {/* HR */}
              <Route path="/hr/recruiting" element={<RecruitingScannerPage />} />
              <Route path="/hr/recruiting/pipeline" element={<RecruitingPipelinePage />} />
              <Route path="/hr/recruiting/all" element={<ApplicantsListPage />} />
              <Route path="/hr/recruiting/interviews" element={<InterviewSchedulingPage />} />
              <Route path="/hr/recruiting/:name" element={<ApplicantDetailPage />} />
              <Route path="/hr/employees" element={<EmployeesPage />} />
              <Route path="/hr/employees/:name" element={<EmployeeDetailPage />} />
              <Route path="/hr/leaves" element={<LeavesPage />} />
              <Route path="/hr/payroll" element={<PayrollPage />} />
              <Route path="/hr/onboarding" element={<OnboardingPage />} />
              <Route path="/hr/onboarding/:name" element={<OnboardingDetailPage />} />

              {/* Finance */}
              <Route path="/finance/invoices" element={<InvoicesPage />} />
              <Route path="/finance/invoices/:name" element={<InvoiceDetailPage />} />
              <Route path="/finance/expenses" element={<ExpensesPage />} />
              <Route path="/finance/expenses/:name" element={<ExpenseDetailPage />} />
              <Route path="/finance/payments" element={<PaymentsPage />} />
              <Route path="/finance/payments/:name" element={<PaymentDetailPage />} />
              <Route path="/finance/journals" element={<JournalsPage />} />
              <Route path="/finance/overview" element={<OverviewPage />} />
            </Route>

            {/* Catch-all: redirect unknown routes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Refine>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

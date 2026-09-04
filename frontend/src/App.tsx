import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { MemberAuthProvider } from "@/lib/MemberAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import MemberProtectedRoute from "@/components/MemberProtectedRoute";
import AppLayout from "@/components/AppLayout";
import AppLoading from "@/components/ui/AppLoading";
import RoleProtectedRoute from "@/components/RoleProtectedRoute";

const Login = lazy(() => import("@/pages/auth/Login"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MembersList = lazy(() => import("@/pages/members/MembersList"));
const MemberDetail = lazy(() => import("@/pages/members/MemberDetail"));
const AddMember = lazy(() => import("@/pages/members/AddMember"));
const UploadMembers = lazy(() => import("@/pages/members/UploadMembers"));
const ImportReview = lazy(() => import("@/pages/members/ImportReview"));
const Report20Upload = lazy(() => import("@/pages/imports/Report20Upload"));
const Report20Review = lazy(() => import("@/pages/imports/Report20Review"));
const MemberHome = lazy(() => import("@/pages/member/MemberHome"));
const MemberClaimNew = lazy(() => import("@/pages/member/MemberClaimNew"));
const MemberPortalLayout = lazy(() => import("@/components/member/MemberPortalLayout"));
const ChangeRequests = lazy(() => import("@/pages/members/ChangeRequests"));
const PendingApprovals = lazy(() => import("@/pages/members/PendingApprovals"));
const Settings = lazy(() => import("@/pages/Settings"));
// const Transfers = lazy(() => import("@/pages/Transfers"));
const Claims = lazy(() => import("@/pages/Claims"));
const ClaimNew = lazy(() => import("@/pages/ClaimNew"));
const Reports = lazy(() => import("@/pages/Reports"));
const Setup = lazy(() => import("@/pages/Setup"));
const System = lazy(() => import("@/pages/System"));
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const NATIONAL_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN"];
const REGIONAL_ROLES = [...NATIONAL_ROLES, "REGIONAL_ADMIN"];

export default function App() {
  return (
    <AuthProvider>
      <MemberAuthProvider>
        <Suspense fallback={<AppLoading label="Loading page" />}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/members" element={<MembersList />} />
              <Route path="/members/new" element={<AddMember />} />
              <Route path="/members/upload" element={<UploadMembers />} />
              <Route path="/members/upload/:id" element={<ImportReview />} />
              <Route path="/members/:id" element={<MemberDetail />} />
              <Route path="/change-requests" element={<ChangeRequests />} />
              <Route path="/approvals" element={<PendingApprovals />} />
              <Route path="/imports/report20" element={<RoleProtectedRoute roles={NATIONAL_ROLES}><Report20Upload /></RoleProtectedRoute>} />
              <Route
                path="/imports/report20/:id"
                element={<RoleProtectedRoute roles={NATIONAL_ROLES}><Report20Review /></RoleProtectedRoute>}
              />
              {/* <Route path="/transfers" element={<Transfers />} /> */}
              <Route path="/claims" element={<Claims />} />
              <Route path="/claims/new" element={<ClaimNew />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/setup" element={<RoleProtectedRoute roles={REGIONAL_ROLES}><Setup /></RoleProtectedRoute>} />
              <Route path="/system" element={<RoleProtectedRoute roles={NATIONAL_ROLES}><System /></RoleProtectedRoute>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          <Route element={<MemberProtectedRoute />}>
            <Route path="/member" element={<MemberPortalLayout />}>
              <Route index element={<MemberHome section="overview" />} />
              <Route path="profile" element={<MemberHome section="profile" />} />
              <Route path="household" element={<MemberHome section="household" />} />
              <Route path="coverage" element={<MemberHome section="coverage" />} />
              <Route path="requests" element={<MemberHome section="requests" />} />
              <Route path="claims" element={<MemberHome section="claims" />} />
              <Route path="claims/new" element={<MemberClaimNew />} />
              <Route path="claims/:id/resubmit" element={<MemberClaimNew />} />
              <Route path="notifications" element={<MemberHome section="notifications" />} />
              <Route path="help" element={<MemberHome section="help" />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </MemberAuthProvider>
    </AuthProvider>
  );
}

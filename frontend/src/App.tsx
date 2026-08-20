import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { MemberAuthProvider } from "@/lib/MemberAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import MemberProtectedRoute from "@/components/MemberProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/auth/Login";
import Dashboard from "@/pages/Dashboard";
import MembersList from "@/pages/members/MembersList";
import MemberDetail from "@/pages/members/MemberDetail";
import AddMember from "@/pages/members/AddMember";
import UploadMembers from "@/pages/members/UploadMembers";
import ImportReview from "@/pages/members/ImportReview";
import Report20Upload from "@/pages/imports/Report20Upload";
import Report20Review from "@/pages/imports/Report20Review";
import MemberHome from "@/pages/member/MemberHome";
import ChangeRequests from "@/pages/members/ChangeRequests";
import PendingApprovals from "@/pages/members/PendingApprovals";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <AuthProvider>
      <MemberAuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

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
              <Route path="/imports/report20" element={<Report20Upload />} />
              <Route
                path="/imports/report20/:id"
                element={<Report20Review />}
              />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          <Route element={<MemberProtectedRoute />}>
            <Route path="/member" element={<MemberHome />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MemberAuthProvider>
    </AuthProvider>
  );
}

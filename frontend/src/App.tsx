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
import MemberHome from "@/pages/member/MemberHome";

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
              <Route path="/members/:id" element={<MemberDetail />} />
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

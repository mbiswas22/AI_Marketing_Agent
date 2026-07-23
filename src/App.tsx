import "./aws-config";
import "@aws-amplify/ui-react/styles.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import Login from "./pages/Login";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import SettingsPage from "./pages/SettingsPage";
import Onboard from "./pages/Onboard";
import InviteAccept from "./pages/InviteAccept";
import Schedules from "./pages/Schedules";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  if (authStatus === "configuring") return null;
  if (authStatus !== "authenticated") {
    sessionStorage.setItem(
      "redirectAfterLogin",
      window.location.pathname + window.location.search,
    );
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) sessionStorage.setItem("inviteToken", token);
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/invite"
          element={
            <ProtectedRoute>
              <InviteAccept />
            </ProtectedRoute>
          }
        />
        <Route
          path="/welcome"
          element={
            <ProtectedRoute>
              <Welcome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedules"
          element={
            <ProtectedRoute>
              <Schedules />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboard"
          element={
            <ProtectedRoute>
              <Onboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <Authenticator.Provider>
      <AppRoutes />
    </Authenticator.Provider>
  );
}

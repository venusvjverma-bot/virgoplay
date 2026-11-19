import { Component } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ClientAuthProvider } from './context/ClientAuthContext';
import { DevAccessProvider } from './context/DevAccessContext';
import ProtectedRoute from './components/ProtectedRoute';
import { isSupabaseConfigured } from './lib/supabase';
import LoginPage                from './pages/auth/LoginPage';
import RegisterPage             from './pages/auth/RegisterPage';
import ForgotPasswordPage       from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage        from './pages/auth/ResetPasswordPage';
import CreatorDashboard         from './pages/dashboard/CreatorDashboard';
import VerificationPage         from './pages/dashboard/VerificationPage';
import AdminDashboard           from './pages/admin/AdminDashboard';
import AdminVerificationsPage   from './pages/admin/AdminVerificationsPage';
import AdminAuditPage           from './pages/admin/AdminAuditPage';
import AdminManagementPage      from './pages/admin/AdminManagementPage';
import IdentityReviewPage       from './pages/admin/IdentityReviewPage';
import ProviderConfigPage       from './pages/admin/ProviderConfigPage';
import LLMChatConfigPage        from './pages/admin/LLMChatConfigPage';
import ModerationConfigPage     from './pages/admin/ModerationConfigPage';
import AdminClientsPage         from './pages/admin/AdminClientsPage';
import ClientPortal             from './pages/portal/ClientPortal';
import ClientSignupPage         from './pages/portal/ClientSignupPage';
import ClientVerifyPage          from './pages/portal/ClientVerifyPage';
import ClientAuthCallbackPage    from './pages/portal/ClientAuthCallbackPage';
import ClientDashboardPage      from './pages/portal/ClientDashboardPage';
import BuyCreditsPage           from './pages/portal/BuyCreditsPage';
import PublicTestChatPage        from './pages/portal/PublicTestChatPage';
import PromotionalPage           from './pages/portal/PromotionalPage';
import ChatLibraryPage           from './pages/portal/ChatLibraryPage';
import TermsPage                from './pages/portal/TermsPage';
import PrivacyPolicyPage         from './pages/portal/PrivacyPolicyPage';
import AboutUsPage              from './pages/portal/AboutUsPage';
import TestCompanionPage        from './pages/dashboard/TestCompanionPage';
import CharacterStudioPage      from './pages/dashboard/CharacterStudioPage';
import CharacterStudioV2Page    from './pages/dashboard/CharacterStudioV2Page';

// ── Root error boundary ───────────────────────────────────────────────────────
// Catches any rendering error that survives component-level error handling and
// prevents the silent blank screen that otherwise appears in Bolt's viewer mode.
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', background: '#080d18', color: '#f1f5f9',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '2rem', fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ maxWidth: '480px', width: '100%' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', color: '#f87171' }}>
            Application Error
          </h1>
          <pre style={{
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem',
            padding: '1rem', fontSize: '0.75rem', overflowX: 'auto',
            color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {error.message}
          </pre>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#475569' }}>
            Check the browser console for the full stack trace.
          </p>
        </div>
      </div>
    );
  }
}

// ── Configuration gate ────────────────────────────────────────────────────────
// Shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent — this
// happens in Bolt's viewer/preview mode where env vars are not exposed.
function ConfigError() {
  return (
    <div style={{
      minHeight: '100vh', background: '#080d18', color: '#f1f5f9',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '2rem', fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: '400px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: '#f59e0b22', border: '1px solid #f59e0b44',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem',
        }}>
          <span style={{ fontSize: '1.5rem' }}>⚙️</span>
        </div>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Environment not configured
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
          This preview requires access to environment variables
          (<code style={{ color: '#60a5fa' }}>VITE_SUPABASE_URL</code> and{' '}
          <code style={{ color: '#60a5fa' }}>VITE_SUPABASE_ANON_KEY</code>).
          Open the project in Bolt as an owner or editor to access the full app.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigError />;

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <ClientAuthProvider>
        <AuthProvider>
          <DevAccessProvider>
            <Routes>
            <Route path="/"                    element={<LoginPage />} />
            <Route path="/login"               element={<LoginPage />} />
            <Route path="/register"            element={<RegisterPage />} />
            <Route path="/forgot-password"    element={<ForgotPasswordPage />} />
            <Route path="/reset-password"     element={<ResetPasswordPage />} />
            <Route path="/dashboard"           element={<ProtectedRoute><CreatorDashboard /></ProtectedRoute>} />
            <Route path="/verification-upload" element={<ProtectedRoute><VerificationPage /></ProtectedRoute>} />
            <Route path="/admin"               element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/verifications" element={<ProtectedRoute requireAdmin><AdminVerificationsPage /></ProtectedRoute>} />
            <Route path="/admin/audit"         element={<ProtectedRoute requireAdmin><AdminAuditPage /></ProtectedRoute>} />
            <Route path="/admin/management"   element={<ProtectedRoute requireAdmin><AdminManagementPage /></ProtectedRoute>} />
            <Route path="/admin/identity-review" element={<ProtectedRoute requireAdmin><IdentityReviewPage /></ProtectedRoute>} />
            <Route path="/admin/provider-config" element={<ProtectedRoute requireAdmin><ProviderConfigPage /></ProtectedRoute>} />
            <Route path="/admin/llm-chat-config" element={<ProtectedRoute requireAdmin><LLMChatConfigPage /></ProtectedRoute>} />
            <Route path="/admin/moderation-config" element={<ProtectedRoute requireAdmin><ModerationConfigPage /></ProtectedRoute>} />
            <Route path="/admin/clients"       element={<ProtectedRoute requireAdmin><AdminClientsPage /></ProtectedRoute>} />
            <Route path="/client-signup"       element={<ClientSignupPage />} />
            <Route path="/client-verify"        element={<ClientVerifyPage />} />
            <Route path="/client-auth-callback"  element={<ClientAuthCallbackPage />} />
            <Route path="/client-welcome"       element={<ClientDashboardPage />} />
            <Route path="/buy-credits"          element={<BuyCreditsPage />} />
            <Route path="/creator/:slug"       element={<ClientPortal />} />
            <Route path="/chat-library"          element={<ChatLibraryPage />} />
            <Route path="/about-us"             element={<AboutUsPage />} />
            <Route path="/terms-of-service"     element={<TermsPage />} />
            <Route path="/privacy-policy"        element={<PrivacyPolicyPage />} />
            <Route path="/test-chat"            element={<PublicTestChatPage />} />
            <Route path="/promotional-page"     element={<PromotionalPage />} />
            <Route path="/test-companion/:sessionId" element={<ProtectedRoute><TestCompanionPage /></ProtectedRoute>} />
            <Route path="/character-studio"    element={<ProtectedRoute><CharacterStudioPage /></ProtectedRoute>} />
            <Route path="/character-studio-v2" element={<ProtectedRoute><CharacterStudioV2Page /></ProtectedRoute>} />
            <Route path="*"                    element={<Navigate to="/" replace />} />
            </Routes>
          </DevAccessProvider>
        </AuthProvider>
        </ClientAuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

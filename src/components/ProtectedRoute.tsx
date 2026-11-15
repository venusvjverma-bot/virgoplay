import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { session, creator, loading } = useAuth();

  console.log('[ProtectedRoute] loading=', loading, 'session=', !!session, 'creator=', creator ? `@${creator.username}` : 'null');

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (requireAdmin && creator?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (!requireAdmin && creator?.role === 'admin') return <Navigate to="/admin" replace />;

  return <>{children}</>;
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Toaster from './components/Toaster.jsx';
import Landing from './pages/Landing.jsx';
import Assessment from './pages/Assessment.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AdminList from './pages/AdminList.jsx';
import AdminDetail from './pages/AdminDetail.jsx';
import AdminLogs from './pages/AdminLogs.jsx';

// Where a signed-in visitor belongs. One redirect on sign-in, none afterwards.
function homeFor(user) {
  if (user.role === 'admin') return '/admin';
  return user.submission_status === 'submitted' ? '/dashboard' : '/assessment';
}

function Splash() {
  return <div className="splash"><span className="eyebrow">Loading</span></div>;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? children : <Navigate to="/assessment" replace />;
}

// A candidate who has already submitted must not reach the upload form again.
function RequireNoSubmission({ children }) {
  const { user } = useAuth();
  return user?.submission_status === 'submitted'
    ? <Navigate to="/dashboard" replace />
    : children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <>
      <Toaster />
      <Routes>
        {/* Public. Sign-in is a Google popup on this page — no route change. */}
        <Route
          path="/"
          element={loading ? <Splash /> : user ? <Navigate to={homeFor(user)} replace /> : <Landing />}
        />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route
            path="/assessment"
            element={<RequireNoSubmission><Assessment /></RequireNoSubmission>}
          />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<RequireAdmin><AdminList /></RequireAdmin>} />
          {/* Must precede /admin/:id, or "activity" is read as a submission id. */}
          <Route path="/admin/activity" element={<RequireAdmin><AdminLogs /></RequireAdmin>} />
          <Route path="/admin/:id" element={<RequireAdmin><AdminDetail /></RequireAdmin>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

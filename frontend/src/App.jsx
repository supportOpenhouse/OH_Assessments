import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Toaster from './components/Toaster.jsx';
import Landing from './pages/Landing.jsx';
import Assessments from './pages/Assessments.jsx';
import Assessment from './pages/Assessment.jsx';
import History from './pages/History.jsx';
import Profile from './pages/Profile.jsx';
import AdminList from './pages/AdminList.jsx';
import AdminDetail from './pages/AdminDetail.jsx';
import AdminCandidates from './pages/AdminCandidates.jsx';
import AdminLogs from './pages/AdminLogs.jsx';

// Where a signed-in visitor belongs. One redirect on sign-in, none afterwards.
// A candidate who has attempted anything lands on their record, not on a list
// of things to start.
function homeFor(user) {
  if (user.role === 'admin') return '/admin';
  return user.submission_count > 0 ? '/history' : '/assessments';
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
  return user?.role === 'admin' ? children : <Navigate to="/assessments" replace />;
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
          {/* Candidate */}
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/assessments/:slug" element={<Assessment />} />
          <Route path="/history" element={<History />} />
          <Route path="/profile" element={<Profile />} />

          {/* Admin. The two literal segments MUST precede /admin/:id, or
              "candidates" and "activity" parse as submission ids. */}
          <Route path="/admin" element={<RequireAdmin><AdminList /></RequireAdmin>} />
          <Route path="/admin/candidates" element={<RequireAdmin><AdminCandidates /></RequireAdmin>} />
          <Route path="/admin/activity" element={<RequireAdmin><AdminLogs /></RequireAdmin>} />
          <Route path="/admin/:id" element={<RequireAdmin><AdminDetail /></RequireAdmin>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

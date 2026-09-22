import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import { homeFor, isAdmin, isStaff } from './utils/roles.js';
import Layout from './components/Layout.jsx';
import Toaster from './components/Toaster.jsx';
import Loader from './components/Loader.jsx';
import Home from './pages/Home.jsx';
import Landing from './pages/Landing.jsx';
import Assessments from './pages/Assessments.jsx';
import Assessment from './pages/Assessment.jsx';
import History from './pages/History.jsx';
import Profile from './pages/Profile.jsx';
import AdminList from './pages/AdminList.jsx';
import AdminDetail from './pages/AdminDetail.jsx';
import AdminCandidates from './pages/AdminCandidates.jsx';
import AdminCandidate from './pages/AdminCandidate.jsx';
import CandidateInfo from './pages/CandidateInfo.jsx';
import AdminLogs from './pages/AdminLogs.jsx';

function Splash() {
  return <div className="splash"><Loader /></div>;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/assessmentlogin" replace />;
  return children;
}

// A page someone's role does not cover sends them HOME, not to a fixed page: an
// internal user who follows an old /admin/activity link belongs on the boards,
// not on the candidates' assessment list. The server refuses the data either way.
function RequireRole({ allow, children }) {
  const { user } = useAuth();
  return allow(user) ? children : <Navigate to={homeFor(user)} replace />;
}

// The assessment pages need a phone and resume on file first. Typing the URL
// lands on the form instead — and the server refuses the upload regardless.
// Profile is NOT behind this: it is where those details are changed later.
function RequireDetails({ children }) {
  const { user } = useAuth();
  return isStaff(user) || user.details_complete
    ? children
    : <Navigate to="/candidate-info" replace />;
}

// Not gated on completeness: after saving, the page slides on to where the
// candidate belongs, and a guard re-rendering first would cut that off.
const isCandidate = (u) => !isStaff(u);

export default function App() {
  const { user, loading } = useAuth();

  return (
    <>
      <Toaster />
      <Routes>
        {/* The public front door. Marketing, always — a signed-in visitor sees it
            too; "Take Assessment" is how they get back to the app. */}
        <Route path="/" element={<Home />} />

        {/* Sign-in. A Google popup on this page — no route change. Already
            signed in, and it hands you straight to where you belong. */}
        <Route
          path="/assessmentlogin"
          element={loading ? <Splash /> : user ? <Navigate to={homeFor(user)} replace /> : <Landing />}
        />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          {/* Candidate */}
          <Route path="/candidate-info" element={<RequireRole allow={isCandidate}><CandidateInfo /></RequireRole>} />
          <Route path="/assessments" element={<RequireDetails><Assessments /></RequireDetails>} />
          <Route path="/assessments/:slug" element={<RequireDetails><Assessment /></RequireDetails>} />
          <Route path="/history" element={<RequireDetails><History /></RequireDetails>} />
          <Route path="/profile" element={<Profile />} />

          {/* Admin. The two literal segments MUST precede /admin/:id, or
              "candidates" and "activity" parse as submission ids. */}
          <Route path="/admin" element={<RequireRole allow={isStaff}><AdminList /></RequireRole>} />
          <Route path="/admin/candidates" element={<RequireRole allow={isStaff}><AdminCandidates /></RequireRole>} />
          <Route path="/admin/candidates/:cid" element={<RequireRole allow={isStaff}><AdminCandidate /></RequireRole>} />
          <Route path="/admin/activity" element={<RequireRole allow={isAdmin}><AdminLogs /></RequireRole>} />
          <Route path="/admin/:id" element={<RequireRole allow={isStaff}><AdminDetail /></RequireRole>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

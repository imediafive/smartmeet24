import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import LandingPage from './LandingPage';
import MeetingRoom from './MeetingRoom';
import LoginPage from './LoginPage';
import PreJoinScreen from './components/PreJoinScreen';
import { useAuthContext } from './AuthContext';
import { motion } from 'framer-motion';
import ErrorBoundary from './ErrorBoundary';
import NotFoundPage from './NotFoundPage';
import Dashboard from './components/Dashboard/Dashboard';
import AdminPage from './AdminPage';
import { mediaManager } from './mediaManager';
import { cn } from './utils';

import { Toaster } from 'sonner';

function App() {
  const [mediaConfig, setMediaConfig] = useState(() => {
    const saved = sessionStorage.getItem('prejoin_config');
    return saved ? JSON.parse(saved) : { micOn: true, videoOn: true };
  });
  const [isHost, setIsHost] = useState(() => sessionStorage.getItem('active_meeting_is_host') === 'true');

  useEffect(() => {
    sessionStorage.setItem('prejoin_config', JSON.stringify(mediaConfig));
  }, [mediaConfig]);

  useEffect(() => {
    sessionStorage.setItem('active_meeting_is_host', String(isHost));
  }, [isHost]);

  const { isLoaded, isSignedIn, logout, user } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.style.backgroundColor = '#ffffff';
    document.body.style.backgroundColor = '#ffffff';
  }, []);

  // Handle legacy ?room= URL redirects
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const legacyRoomId = params.get('room');
    if (legacyRoomId) {
      navigate(`/preview/${legacyRoomId.toLowerCase()}`, { replace: true });
    }
  }, [location.search, navigate]);

  // Handle media cleanup when not in meeting/preview
  useEffect(() => {
    const isMeetingPath = location.pathname.startsWith('/meeting/') || location.pathname.startsWith('/preview/');
    if (!isMeetingPath) {
      mediaManager.killAll();
    }
  }, [location.pathname]);

  const handleStartMeeting = () => {
    const id = Math.random().toString(36).substring(7);
    setIsHost(true);
    navigate(`/preview/${id}`);
  };

  const handleJoinMeeting = (id) => {
    setIsHost(false);
    navigate(`/preview/${id}`);
  };

  const enterMeeting = (id, config) => {
    setMediaConfig(config);
    navigate(`/meeting/${id}`);
  };

  const handleLeave = () => {
    setIsHost(false);
    sessionStorage.removeItem('active_meeting_is_host');
    navigate(isSignedIn ? '/dashboard' : '/', { state: { refresh: true } });
  };

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center transition-colors duration-300 bg-white">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          <span className="font-black text-2xl tracking-tighter text-black">smartMeet</span>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster 
        position="top-center" 
        richColors 
        closeButton 
        theme="light"
        toastOptions={{
          style: {
            borderRadius: '20px',
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)',
            padding: '16px 24px',
            fontSize: '12px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }
        }}
      />
      <div className="min-h-screen transition-colors duration-300 bg-white text-black">
        <Routes>
          {/* Public Routes - but redirect if signed in */}
          <Route path="/" element={
            isSignedIn ? (user?.email === 'admin@gmail.com' ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />) : (
              <LandingPage />
            )
          } />

          <Route path="/login" element={
            isSignedIn ? (user?.email === 'admin@gmail.com' ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />) : (
              <LoginPage
                onBack={() => navigate('/')}
              />
            )
          } />

          <Route path="/signup" element={
            isSignedIn ? (user?.email === 'admin@gmail.com' ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />) : (
              <LoginPage
                onBack={() => navigate('/')}
                initialMode="register"
              />
            )
          } />

          {/* Protected Routes */}
          <Route path="/admin" element={
            isSignedIn ? (
              user?.email === 'admin@gmail.com' ? (
                <AdminPage />
              ) : <Navigate to="/dashboard" replace />
            ) : <Navigate to="/login" replace />
          } />

          <Route path="/dashboard" element={
            isSignedIn ? (
              user?.email === 'admin@gmail.com' ? <Navigate to="/admin" replace /> : (
                <Dashboard
                  onNewMeeting={handleStartMeeting}
                  onSignOut={() => {
                    logout();
                    navigate('/');
                  }}
                />
              )
            ) : <Navigate to="/login" replace />
          } />

          <Route path="/preview/:roomId" element={
            isSignedIn ? (
              <RouteWrapper component={PreJoinScreen}
                props={{
                  onJoin: (id, config) => enterMeeting(id.trim(), config),
                  onBack: () => navigate('/dashboard')
                }}
              />
            ) : <Navigate to="/login" replace />
          } />

          <Route path="/meeting/:roomId" element={
            (isSignedIn || new URLSearchParams(window.location.search).get('bot_token')) ? (
              <RouteWrapper component={MeetingRoom}
                props={{
                  onLeave: handleLeave,
                  initialConfig: mediaConfig,
                  isHost: isHost,
                  setIsHost: setIsHost
                }}
              />
            ) : <Navigate to="/login" replace />
          } />

          {/* Fallback */}
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={
            isSignedIn ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />
          } />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

// Small helper to pass params from URL to components that expect them in props (to minimize component refactoring)
function RouteWrapper({ component: Component, props }) {
  const { roomId: rawRoomId } = useParams();
  const roomId = rawRoomId?.trim();
  const { onJoin, ...otherProps } = props;

  // Intercept onJoin to include roomId if it's the preview screen
  const handleJoin = (config) => {
    if (onJoin) onJoin(roomId, config);
  };

  return <Component roomId={roomId} {...otherProps} onJoin={handleJoin} />;
}

export default App;

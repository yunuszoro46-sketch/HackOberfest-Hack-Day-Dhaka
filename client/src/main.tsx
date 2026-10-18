import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './index.css';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CreateProject from './pages/CreateProject';
import Agents from './pages/Agents';
import Workspace from './pages/Workspace';
import Context from './pages/Context';
import ArtifactView from './pages/ArtifactView';
import NotFound from './pages/NotFound';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects/new" element={<CreateProject />} />
          <Route path="/projects/:id/agents" element={<Agents />} />
          <Route path="/projects/:id" element={<Workspace />} />
          <Route path="/projects/:id/context" element={<Context />} />
          <Route path="/artifacts/:id" element={<ArtifactView />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

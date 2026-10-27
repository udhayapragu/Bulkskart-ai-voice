import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ProtectedLayout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { SuppliersPage } from './pages/Suppliers';
import { LeadsPage } from './pages/Leads';
import { CampaignsPage } from './pages/Campaigns';
import { CallsPage, CallDetailPage } from './pages/Calls';
import { VoiceAgentPage } from './pages/VoiceAgent';
import { LanguagesPage } from './pages/Languages';
import { KnowledgePage } from './pages/Knowledge';
import { UsagePage } from './pages/Usage';
import { IntegrationsPage } from './pages/Integrations';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="calls/:id" element={<CallDetailPage />} />
          <Route path="voice-agent" element={<VoiceAgentPage />} />
          <Route path="languages" element={<LanguagesPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

import { AppLayout } from "@/components/Layout";
import { MantineProvider } from "@mantine/core";
import { Route, HashRouter as Router, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/dashboard";
import { GalleryPage } from "./pages/gallery";
import { HomePage } from "./pages/home";
import { MessagesPage } from "./pages/messages";
import { ProfilePage } from "./pages/profile";
import { SearchPage } from "./pages/search";
import { SettingsPage } from "./pages/settings";
import { ShowcasePage } from "./pages/showcase";
import { SystemPage } from "./pages/system";
import theme from "./theme";

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/showcase" element={<ShowcasePage />} />
            <Route path="/system" element={<SystemPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
      </Router>
    </MantineProvider>
  );
}

export default App;

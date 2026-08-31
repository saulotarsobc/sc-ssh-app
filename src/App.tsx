import { AppLayout } from "@/components/Layout";
import { Center, Loader, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { lazy, Suspense } from "react";
import { Route, HashRouter as Router, Routes } from "react-router-dom";
import theme from "./theme";

const ActivityPage = lazy(() =>
  import("./pages/activity").then((module) => ({
    default: module.ActivityPage,
  })),
);
const HostsPage = lazy(() =>
  import("./pages/hosts").then((module) => ({ default: module.HostsPage })),
);
const KeysPage = lazy(() =>
  import("./pages/keys").then((module) => ({ default: module.KeysPage })),
);
const OverviewPage = lazy(() =>
  import("./pages/overview").then((module) => ({
    default: module.OverviewPage,
  })),
);
const RotationsPage = lazy(() =>
  import("./pages/rotations").then((module) => ({
    default: module.RotationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/settings").then((module) => ({
    default: module.SettingsPage,
  })),
);

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <Router>
        <AppLayout>
          <Suspense
            fallback={
              <Center h="calc(100vh - 68px)">
                <Loader aria-label="Loading page" />
              </Center>
            }
          >
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/keys" element={<KeysPage />} />
              <Route path="/hosts" element={<HostsPage />} />
              <Route path="/rotations" element={<RotationsPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </Router>
    </MantineProvider>
  );
}

export default App;

import { ColorSchemeToggle } from "@/components/ColorSchemeToggle/ColorSchemeToggle";
import { UpdateBanner } from "@/components/UpdateBanner/UpdateBanner";
import { useUpdateStatus } from "@/hooks/useUpdateStatus";
import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBrandGithub,
  IconDeviceDesktopAnalytics,
  IconHome,
  IconLayoutDashboard,
  IconMessageCircle,
  IconPhoto,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
}

const navigationSections = [
  {
    title: "Overview",
    links: [
      { icon: IconHome, label: "Home", path: "/" },
      { icon: IconLayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: IconSparkles, label: "Showcase", path: "/showcase" },
      { icon: IconDeviceDesktopAnalytics, label: "System", path: "/system" },
    ],
  },
  {
    title: "App examples",
    links: [
      { icon: IconPhoto, label: "Gallery", path: "/gallery" },
      { icon: IconMessageCircle, label: "Messages", path: "/messages" },
      { icon: IconSearch, label: "Search", path: "/search" },
      { icon: IconUser, label: "Profile", path: "/profile" },
      { icon: IconSettings, label: "Settings", path: "/settings" },
    ],
  },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();
  const curretYear = new Date().getFullYear();
  const updateStatus = useUpdateStatus();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 300, breakpoint: "sm", collapsed: { mobile: !opened } }}
      // The footer only exists while an update is in progress; `collapsed` is
      // what gives the height back to the content the rest of the time.
      footer={{ height: 48, collapsed: !updateStatus }}
      padding="md"
    >
      {/* Header */}
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Title order={3}>Electron + React + Vite + Mantine</Title>
          </Group>

          <Group>
            <ColorSchemeToggle />
            <ActionIcon
              variant="light"
              size="lg"
              component="a"
              href="https://github.com/saulotarsobc"
              target="_blank"
            >
              <IconBrandGithub size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Navbar */}
      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          {navigationSections.map((section, sectionIndex) => (
            <Box key={section.title} mb="md">
              <Text size="xs" fw={500} c="dimmed" tt="uppercase" mb="xs">
                {section.title}
              </Text>
              <Stack gap="xs">
                {section.links.map((link) => (
                  <NavLink
                    key={link.path}
                    href="#"
                    label={link.label}
                    leftSection={<link.icon size={20} stroke={1.5} />}
                    active={location.pathname === link.path}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(link.path);
                      if (opened) toggle(); // Close mobile menu after navigation
                    }}
                    variant="filled"
                  />
                ))}
              </Stack>
              {sectionIndex < navigationSections.length - 1 && (
                <Divider mt="md" />
              )}
            </Box>
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="md" />
          <Box p="xs" style={{ textAlign: "center" }}>
            <Text size="xs" c="dimmed">
              My Boilerplate
            </Text>
            <Text size="xs" c="dimmed">
              © {curretYear} Saulo Costa
            </Text>
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Main Content */}
      <AppShell.Main>{children}</AppShell.Main>

      {/* Auto-update */}
      {updateStatus && (
        <AppShell.Footer>
          <UpdateBanner status={updateStatus} />
        </AppShell.Footer>
      )}
    </AppShell>
  );
}

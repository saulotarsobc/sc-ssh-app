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
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconActivityHeartbeat,
  IconBrandGithub,
  IconKey,
  IconLockSquareRounded,
  IconRefresh,
  IconServer,
  IconSettings,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const links = [
  { icon: IconShieldCheck, label: "Overview", path: "/" },
  { icon: IconKey, label: "SSH keys", path: "/keys" },
  { icon: IconServer, label: "Hosts & config", path: "/hosts" },
  { icon: IconRefresh, label: "Rotations", path: "/rotations" },
  { icon: IconActivityHeartbeat, label: "Activity", path: "/activity" },
  { icon: IconSettings, label: "Settings", path: "/settings" },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();
  const updateStatus = useUpdateStatus();
  return (
    <AppShell
      header={{ height: 68 }}
      navbar={{ width: 270, breakpoint: "sm", collapsed: { mobile: !opened } }}
      footer={{ height: 48, collapsed: !updateStatus }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <ThemeIcon
              variant="gradient"
              gradient={{ from: "teal", to: "cyan" }}
              size="lg"
            >
              <IconLockSquareRounded size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>SC - SSH Keys Manager</Title>
              <Text size="xs" c="dimmed">
                Local-first identity security
              </Text>
            </div>
          </Group>
          <Group>
            <ColorSchemeToggle />
            <Tooltip label="GitHub repository">
              <ActionIcon
                variant="subtle"
                size="lg"
                component="a"
                href="https://github.com/saulotarsobc/sc-ssh-app"
                target="_blank"
                rel="noreferrer"
              >
                <IconBrandGithub size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mb="sm">
            Workspace
          </Text>
          <Stack gap={4}>
            {links.map((link) => (
              <NavLink
                key={link.path}
                label={link.label}
                leftSection={<link.icon size={19} />}
                active={location.pathname === link.path}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.path);
                  close();
                }}
                variant="light"
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Divider mb="md" />
          <Box px="sm">
            <Group gap="xs">
              <span className="pulse-dot" />
              <Text size="xs" c="dimmed">
                No cloud. No telemetry.
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              © {new Date().getFullYear()} Saulo Costa
            </Text>
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
      {updateStatus && (
        <AppShell.Footer>
          <UpdateBanner status={updateStatus} />
        </AppShell.Footer>
      )}
    </AppShell>
  );
}

import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAtom,
  IconBolt,
  IconBrandMantine,
  IconBrandReact,
  IconBrandTypescript,
  IconDeviceDesktop,
  IconLayoutDashboard,
  IconMoon,
  IconPlugConnected,
  IconRocket,
  IconRoute,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";
import { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import pkg from "../../package.json";
import classes from "./home.module.css";

const version = (range: string) => range.replace(/^[\^~]/, "v");

const stack = [
  {
    icon: IconAtom,
    name: "Electron",
    color: "teal",
    version: version(pkg.devDependencies.electron),
    description:
      "Native desktop shell: file system, menus, tray and typed IPC with web tech.",
  },
  {
    icon: IconBrandReact,
    name: "React",
    color: "cyan",
    version: version(pkg.dependencies.react),
    description:
      "Declarative UI with the latest concurrent features and hooks.",
  },
  {
    icon: IconBolt,
    name: "Vite",
    color: "yellow",
    version: version(pkg.devDependencies.vite),
    description:
      "Instant dev server with hot module replacement measured in milliseconds.",
  },
  {
    icon: IconBrandMantine,
    name: "Mantine",
    color: "blue",
    version: version(pkg.dependencies["@mantine/core"]),
    description:
      "120+ accessible components, dark mode and CSS-first theming out of the box.",
  },
];

const features = [
  {
    icon: IconPlugConnected,
    color: "teal",
    title: "Typed IPC bridge",
    description: "contextBridge + shared types between main and renderer.",
  },
  {
    icon: IconBrandTypescript,
    color: "blue",
    title: "Strict TypeScript",
    description: "Strict mode everywhere, backend included.",
  },
  {
    icon: IconMoon,
    color: "grape",
    title: "Dark mode built-in",
    description: "Animated color scheme toggle, persisted by Mantine.",
  },
  {
    icon: IconRoute,
    color: "orange",
    title: "Routing ready",
    description: "React Router with a responsive AppShell layout.",
  },
  {
    icon: IconSparkles,
    color: "pink",
    title: "Animations everywhere",
    description: "CSS keyframes, Mantine transitions and count-up stats.",
  },
  {
    icon: IconDeviceDesktop,
    color: "cyan",
    title: "Cross-platform builds",
    description: "electron-builder targets Windows, macOS and Linux.",
  },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <Container size="lg" py="xl">
      {/* Hero */}
      <div className={classes.hero}>
        <Group justify="center" gap="lg" mb="lg">
          {stack.map((tech, index) => (
            <ThemeIcon
              key={tech.name}
              className="float"
              style={{ "--stagger": index } as CSSProperties}
              variant="light"
              color={tech.color}
              size={54}
              radius="md"
            >
              <tech.icon size={32} stroke={1.5} />
            </ThemeIcon>
          ))}
        </Group>

        <Badge
          className="fade-in-up"
          variant="outline"
          size="lg"
          leftSection={<span className="pulse-dot" />}
          mb="md"
        >
          Electron + React + Vite + Mantine
        </Badge>

        <Title className={`${classes.title} fade-in-up`} order={1}>
          Build beautiful desktop apps
          <br />
          <span className={`gradient-text ${classes.gradientText}`}>
            at lightning speed
          </span>
        </Title>

        <Text
          className="fade-in-up"
          style={{ "--stagger": 2 } as CSSProperties}
          size="lg"
          c="dimmed"
          maw={560}
          mx="auto"
          mt="lg"
        >
          A batteries-included boilerplate: typed IPC, animated UI, dark mode,
          routing and cross-platform packaging — ready before your coffee gets
          cold.
        </Text>

        <Group
          className="fade-in-up"
          style={{ "--stagger": 3 } as CSSProperties}
          justify="center"
          mt="xl"
        >
          <Button
            size="md"
            variant="gradient"
            leftSection={<IconLayoutDashboard size={18} />}
            onClick={() => navigate("/dashboard")}
          >
            Live dashboard
          </Button>
          <Button
            size="md"
            variant="default"
            leftSection={<IconSparkles size={18} />}
            onClick={() => navigate("/showcase")}
          >
            Component showcase
          </Button>
          <Button
            size="md"
            variant="subtle"
            leftSection={<IconTerminal2 size={18} />}
            onClick={() => navigate("/system")}
          >
            System monitor
          </Button>
        </Group>
      </div>

      {/* Stack cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg" mt="xl">
        {stack.map((tech, index) => (
          <Card
            key={tech.name}
            className={`${classes.stackCard} hover-lift fade-in-up`}
            style={
              {
                "--stagger": index + 4,
                "--stack-color": `var(--mantine-color-${tech.color}-5)`,
              } as CSSProperties
            }
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
          >
            <Group justify="space-between" mb="sm">
              <ThemeIcon variant="light" color={tech.color} size="lg">
                <tech.icon size={22} stroke={1.5} />
              </ThemeIcon>
              <Badge variant="light" color={tech.color}>
                {tech.version}
              </Badge>
            </Group>
            <Text fw={700} mb={4}>
              {tech.name}
            </Text>
            <Text size="sm" c="dimmed">
              {tech.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Feature grid */}
      <Card
        className="fade-in-up"
        style={{ "--stagger": 8 } as CSSProperties}
        shadow="sm"
        padding="xl"
        radius="md"
        withBorder
        mt="xl"
      >
        <Group mb="lg">
          <ThemeIcon variant="gradient" size="lg" radius="md">
            <IconRocket size={22} stroke={1.5} />
          </ThemeIcon>
          <Title order={3}>Everything wired up</Title>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {features.map((feature) => (
            <Group key={feature.title} align="flex-start" wrap="nowrap">
              <ThemeIcon variant="light" color={feature.color} size="md">
                <feature.icon size={18} stroke={1.5} />
              </ThemeIcon>
              <Stack gap={2}>
                <Text fw={600} size="sm">
                  {feature.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {feature.description}
                </Text>
              </Stack>
            </Group>
          ))}
        </SimpleGrid>
      </Card>
    </Container>
  );
}

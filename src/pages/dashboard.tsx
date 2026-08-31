import { useCountUp } from "@/hooks/useCountUp";
import {
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  Progress,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconBug,
  IconChartBar,
  IconCircleCheck,
  IconCurrencyDollar,
  IconDownload,
  IconGitBranch,
  IconLayoutDashboard,
  IconMoodSmile,
  IconPackage,
  IconRefresh,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";
import { CSSProperties, useState } from "react";
import classes from "./dashboard.module.css";

const numberFormat = new Intl.NumberFormat("en-US");

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const random = (min: number, max: number) =>
  Math.round(min + Math.random() * (max - min));

const randomStats = () => ({
  revenue: random(30_000, 90_000),
  users: random(800, 4_000),
  downloads: random(5_000, 20_000),
  satisfaction: random(86, 99),
  months: MONTHS.map(() => random(15, 100)),
  ring: [random(20, 45), random(10, 30), random(5, 20)],
  projects: {
    tasks: random(40, 95),
    storage: random(20, 80),
    tests: random(60, 99),
  },
});

interface StatCardProps {
  icon: typeof IconUsers;
  color: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  diff: number;
  stagger: number;
}

function StatCard({
  icon: Icon,
  color,
  label,
  value,
  prefix = "",
  suffix = "",
  diff,
  stagger,
}: StatCardProps) {
  const animated = useCountUp(value);
  const DiffIcon = diff >= 0 ? IconTrendingUp : IconTrendingDown;

  return (
    <Card
      className="hover-lift fade-in-up"
      style={{ "--stagger": stagger } as CSSProperties}
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
    >
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
          {label}
        </Text>
        <ThemeIcon variant="light" color={color} size="md" radius="md">
          <Icon size={18} stroke={1.5} />
        </ThemeIcon>
      </Group>

      <Group align="flex-end" gap="xs">
        <Text fz={28} fw={800} lh={1}>
          {prefix}
          {numberFormat.format(Math.round(animated))}
          {suffix}
        </Text>
        <Badge
          variant="light"
          color={diff >= 0 ? "teal" : "red"}
          leftSection={<DiffIcon size={12} />}
        >
          {Math.abs(diff)}%
        </Badge>
      </Group>

      <Text size="xs" c="dimmed" mt="xs">
        Compared to previous month
      </Text>
    </Card>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState(randomStats);

  const tasks = useCountUp(stats.projects.tasks);
  const storage = useCountUp(stats.projects.storage);
  const tests = useCountUp(stats.projects.tests);

  const ringTotal = stats.ring.reduce((sum, value) => sum + value, 0);
  const maxMonth = Math.max(...stats.months);

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Group>
          <IconLayoutDashboard size={32} />
          <Title order={1}>Dashboard</Title>
          <Badge
            variant="outline"
            color="green"
            leftSection={<span className="pulse-dot" />}
          >
            Live
          </Badge>
        </Group>

        <Button
          leftSection={<IconRefresh size={16} />}
          variant="light"
          onClick={() => setStats(randomStats())}
        >
          Randomize data
        </Button>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Every number, ring and bar animates — click{" "}
        <Text span fw={600} inherit>
          Randomize data
        </Text>{" "}
        and watch the UI glide to the new values.
      </Text>

      {/* Animated stat cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg" mb="lg">
        <StatCard
          icon={IconCurrencyDollar}
          color="teal"
          label="Revenue"
          value={stats.revenue}
          prefix="$"
          diff={12}
          stagger={0}
        />
        <StatCard
          icon={IconUsers}
          color="blue"
          label="Active users"
          value={stats.users}
          diff={8}
          stagger={1}
        />
        <StatCard
          icon={IconDownload}
          color="grape"
          label="Downloads"
          value={stats.downloads}
          diff={-3}
          stagger={2}
        />
        <StatCard
          icon={IconMoodSmile}
          color="yellow"
          label="Satisfaction"
          value={stats.satisfaction}
          suffix="%"
          diff={4}
          stagger={3}
        />
      </SimpleGrid>

      <Grid gap="lg" mb="lg">
        {/* Animated bar chart (pure CSS) */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card
            className="fade-in-up"
            style={{ "--stagger": 4 } as CSSProperties}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            h="100%"
          >
            <Group mb="md">
              <IconChartBar size={20} />
              <Title order={4}>Commits per month</Title>
            </Group>

            <div className={classes.chart}>
              {stats.months.map((value, index) => (
                <div className={classes.barColumn} key={MONTHS[index]}>
                  <Tooltip
                    label={`${MONTHS[index]}: ${value} commits`}
                    withArrow
                    transitionProps={{ transition: "pop", duration: 150 }}
                  >
                    <div className={classes.barTrack}>
                      <div
                        className={classes.bar}
                        style={
                          {
                            height: `${(value / maxMonth) * 100}%`,
                            "--stagger": index,
                          } as CSSProperties
                        }
                      />
                    </div>
                  </Tooltip>
                  <Text size="xs" c="dimmed">
                    {MONTHS[index]}
                  </Text>
                </div>
              ))}
            </div>
          </Card>
        </Grid.Col>

        {/* Animated ring progress */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card
            className="fade-in-up"
            style={{ "--stagger": 5 } as CSSProperties}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            h="100%"
          >
            <Title order={4} mb="md">
              Storage usage
            </Title>

            <Group justify="center">
              <RingProgress
                size={190}
                thickness={16}
                roundCaps
                transitionDuration={700}
                label={
                  <Text ta="center" fz={28} fw={800}>
                    {ringTotal}%
                  </Text>
                }
                sections={[
                  {
                    value: stats.ring[0],
                    color: "cyan",
                    tooltip: `Documents — ${stats.ring[0]}%`,
                  },
                  {
                    value: stats.ring[1],
                    color: "blue",
                    tooltip: `Media — ${stats.ring[1]}%`,
                  },
                  {
                    value: stats.ring[2],
                    color: "grape",
                    tooltip: `Other — ${stats.ring[2]}%`,
                  },
                ]}
              />
            </Group>

            <Stack gap={6} mt="md">
              {[
                { label: "Documents", color: "cyan", value: stats.ring[0] },
                { label: "Media", color: "blue", value: stats.ring[1] },
                { label: "Other", color: "grape", value: stats.ring[2] },
              ].map((item) => (
                <Group key={item.label} justify="space-between">
                  <Group gap="xs">
                    <Badge
                      variant="filled"
                      color={item.color}
                      size="xs"
                      circle
                    />
                    <Text size="sm">{item.label}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {item.value}%
                  </Text>
                </Group>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="lg">
        {/* Activity timeline */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card
            className="fade-in-up"
            style={{ "--stagger": 6 } as CSSProperties}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            h="100%"
          >
            <Title order={4} mb="lg">
              Recent activity
            </Title>

            <Timeline active={2} bulletSize={30} lineWidth={2}>
              <Timeline.Item
                bullet={<IconGitBranch size={16} />}
                title="New branch created"
              >
                <Text size="sm" c="dimmed">
                  feature/animated-dashboard pushed to origin
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  2 minutes ago
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconCircleCheck size={16} />}
                title="CI pipeline passed"
              >
                <Text size="sm" c="dimmed">
                  Build, lint and 214 tests green in 1m 42s
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  25 minutes ago
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconPackage size={16} />}
                title="Release v1.1.0 published"
                lineVariant="dashed"
              >
                <Text size="sm" c="dimmed">
                  Installers built for Windows, macOS and Linux
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  2 hours ago
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconBug size={16} />}
                title="Bug reported"
              >
                <Text size="sm" c="dimmed">
                  Tray icon misaligned on HiDPI displays
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  5 hours ago
                </Text>
              </Timeline.Item>
            </Timeline>
          </Card>
        </Grid.Col>

        {/* Animated progress bars */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card
            className="fade-in-up"
            style={{ "--stagger": 7 } as CSSProperties}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            h="100%"
          >
            <Title order={4} mb="lg">
              Project health
            </Title>

            <Stack gap="lg">
              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Sprint tasks
                  </Text>
                  <Text size="sm" c="dimmed">
                    {Math.round(tasks)}%
                  </Text>
                </Group>
                <Progress value={tasks} color="teal" size="lg" radius="xl" />
              </div>

              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Storage quota
                  </Text>
                  <Text size="sm" c="dimmed">
                    {Math.round(storage)}%
                  </Text>
                </Group>
                <Progress
                  value={storage}
                  color="blue"
                  size="lg"
                  radius="xl"
                  striped
                  animated
                />
              </div>

              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Test coverage
                  </Text>
                  <Text size="sm" c="dimmed">
                    {Math.round(tests)}%
                  </Text>
                </Group>
                <Progress value={tests} color="grape" size="lg" radius="xl" />
              </div>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

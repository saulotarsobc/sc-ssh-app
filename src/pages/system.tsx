import { useCountUp } from "@/hooks/useCountUp";
import type { SystemInfo, SystemMetrics } from "@/types/ipc";
import {
  Alert,
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
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowsLeftRight,
  IconAtom,
  IconBrandChrome,
  IconBrandNodejs,
  IconCpu,
  IconDatabase,
  IconDeviceDesktopAnalytics,
  IconEngine,
  IconHourglass,
} from "@tabler/icons-react";
import { CSSProperties, useEffect, useState } from "react";

const formatBytes = (bytes: number) => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

const formatUptime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`;
};

interface PingStats {
  last: number;
  average: number;
  best: number;
}

export function SystemPage() {
  const isElectron = typeof window.ipcRenderer !== "undefined";

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [ping, setPing] = useState<PingStats | null>(null);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    if (!isElectron) return;

    window.ipcRenderer.invoke<SystemInfo>("system:info").then(setInfo);

    const fetchMetrics = () =>
      window.ipcRenderer
        .invoke<SystemMetrics>("system:metrics")
        .then(setMetrics);

    fetchMetrics();
    const interval = window.setInterval(fetchMetrics, 1000);
    return () => window.clearInterval(interval);
  }, [isElectron]);

  const runPing = async () => {
    setPinging(true);
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await window.ipcRenderer.invoke("system:ping");
      samples.push(performance.now() - start);
    }
    setPing({
      last: samples[samples.length - 1],
      average: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      best: Math.min(...samples),
    });
    setPinging(false);
  };

  const memoryPercent = metrics
    ? (metrics.usedMemoryBytes / metrics.totalMemoryBytes) * 100
    : 0;
  const animatedMemory = useCountUp(memoryPercent, 800);
  const cpuPercent = metrics ? Math.min(metrics.appCpuPercent, 100) : 0;

  const versions = info
    ? [
        {
          icon: IconAtom,
          color: "teal",
          label: "Electron",
          value: info.electronVersion,
        },
        {
          icon: IconBrandChrome,
          color: "blue",
          label: "Chromium",
          value: info.chromeVersion,
        },
        {
          icon: IconBrandNodejs,
          color: "green",
          label: "Node.js",
          value: info.nodeVersion,
        },
        {
          icon: IconEngine,
          color: "orange",
          label: "V8",
          value: info.v8Version,
        },
      ]
    : [];

  return (
    <Container size="lg" py="xl">
      <Group mb="xl">
        <IconDeviceDesktopAnalytics size={32} />
        <Title order={1}>System monitor</Title>
        {isElectron && (
          <Badge
            variant="outline"
            color="green"
            leftSection={<span className="pulse-dot" />}
          >
            Polling every 1s
          </Badge>
        )}
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Real data flowing from the Electron main process to React through the
        typed IPC bridge — this is where the “desktop” in desktop app happens.
      </Text>

      {!isElectron && (
        <Alert
          icon={<IconAlertTriangle size={18} />}
          title="Electron bridge not found"
          color="yellow"
          radius="md"
        >
          This page talks to the Electron main process. Run the app with{" "}
          <b>npm run dev</b> to see live system data.
        </Alert>
      )}

      {isElectron && (
        <Stack gap="lg">
          {/* Runtime versions */}
          <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="lg">
            {versions.map((item, index) => (
              <Card
                key={item.label}
                className="hover-lift fade-in-up"
                style={{ "--stagger": index } as CSSProperties}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
              >
                <Group>
                  <ThemeIcon
                    variant="light"
                    color={item.color}
                    size="xl"
                    radius="md"
                  >
                    <item.icon size={26} stroke={1.5} />
                  </ThemeIcon>
                  <div>
                    <Text size="md" c="dimmed" fw={700} tt="uppercase">
                      {item.label}
                    </Text>
                    <Text fw={300} color="dimmed" fz="xs">
                      {item.value}
                    </Text>
                  </div>
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          <Grid gap="lg">
            {/* Live metrics */}
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
                <Group mb="lg">
                  <IconDatabase size={20} />
                  <Title order={4}>Live metrics</Title>
                </Group>

                <Stack gap="lg">
                  <div>
                    <Group justify="space-between" mb={6}>
                      <Text size="sm" fw={600}>
                        System memory
                      </Text>
                      <Text size="sm" c="dimmed">
                        {metrics
                          ? `${formatBytes(metrics.usedMemoryBytes)} / ${formatBytes(metrics.totalMemoryBytes)}`
                          : "…"}
                      </Text>
                    </Group>
                    <Progress
                      value={animatedMemory}
                      size="xl"
                      radius="xl"
                      color={memoryPercent > 85 ? "red" : "blue"}
                    />
                  </div>

                  <SimpleGrid cols={3}>
                    <div>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        App memory
                      </Text>
                      <Text fw={700} fz="lg">
                        {metrics ? formatBytes(metrics.appMemoryBytes) : "…"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {metrics?.processCount ?? 0} processes
                      </Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        App uptime
                      </Text>
                      <Text fw={700} fz="lg">
                        {metrics ? formatUptime(metrics.appUptimeSec) : "…"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        <IconHourglass
                          size={12}
                          style={{ verticalAlign: "middle" }}
                        />{" "}
                        since launch
                      </Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        System uptime
                      </Text>
                      <Text fw={700} fz="lg">
                        {metrics ? formatUptime(metrics.systemUptimeSec) : "…"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        since boot
                      </Text>
                    </div>
                  </SimpleGrid>
                </Stack>
              </Card>
            </Grid.Col>

            {/* App CPU ring */}
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
                <Group mb="md">
                  <IconCpu size={20} />
                  <Title order={4}>App CPU usage</Title>
                </Group>

                <Group justify="center">
                  <RingProgress
                    size={180}
                    thickness={14}
                    roundCaps
                    transitionDuration={600}
                    label={
                      <Text ta="center" fz={26} fw={800}>
                        {cpuPercent.toFixed(1)}%
                      </Text>
                    }
                    sections={[
                      {
                        value: cpuPercent,
                        color:
                          cpuPercent > 60
                            ? "red"
                            : cpuPercent > 30
                              ? "yellow"
                              : "teal",
                      },
                    ]}
                  />
                </Group>

                <Text size="xs" c="dimmed" ta="center" mt="sm">
                  Sum of all Electron processes ({info?.cpuCores ?? "…"} cores
                  available)
                </Text>
              </Card>
            </Grid.Col>
          </Grid>

          <Grid gap="lg">
            {/* IPC latency */}
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Card
                className="fade-in-up"
                style={{ "--stagger": 6 } as CSSProperties}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                h="100%"
              >
                <Group mb="md">
                  <IconArrowsLeftRight size={20} />
                  <Title order={4}>IPC round-trip</Title>
                </Group>

                <Text size="sm" c="dimmed" mb="md">
                  Sends 20 messages renderer → main → renderer and measures the
                  round-trip. Spoiler: it is fast.
                </Text>

                <Button
                  fullWidth
                  variant="gradient"
                  loading={pinging}
                  onClick={runPing}
                  mb="md"
                >
                  Ping main process ×20
                </Button>

                {ping && (
                  <SimpleGrid cols={3}>
                    <div>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        Best
                      </Text>
                      <Text fw={800} fz="xl" c="teal">
                        {ping.best.toFixed(2)}ms
                      </Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        Average
                      </Text>
                      <Text fw={800} fz="xl">
                        {ping.average.toFixed(2)}ms
                      </Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        Last
                      </Text>
                      <Text fw={800} fz="xl">
                        {ping.last.toFixed(2)}ms
                      </Text>
                    </div>
                  </SimpleGrid>
                )}
              </Card>
            </Grid.Col>

            {/* Machine info */}
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Card
                className="fade-in-up"
                style={{ "--stagger": 7 } as CSSProperties}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                h="100%"
              >
                <Title order={4} mb="md">
                  Machine
                </Title>

                <Table variant="vertical" layout="fixed" withRowBorders={false}>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Th w={140}>OS</Table.Th>
                      <Table.Td>{info?.osVersion ?? "…"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Th>Platform</Table.Th>
                      <Table.Td>
                        {info ? `${info.platform} (${info.arch})` : "…"}
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Th>Hostname</Table.Th>
                      <Table.Td>{info?.hostname ?? "…"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Th>CPU</Table.Th>
                      <Table.Td>
                        {info
                          ? `${info.cpuModel} — ${info.cpuCores} cores`
                          : "…"}
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Th>Total memory</Table.Th>
                      <Table.Td>
                        {info ? formatBytes(info.totalMemoryBytes) : "…"}
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Th>App version</Table.Th>
                      <Table.Td>
                        {info ? `v${info.appVersion} (${info.locale})` : "…"}
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Card>
            </Grid.Col>
          </Grid>
        </Stack>
      )}
    </Container>
  );
}

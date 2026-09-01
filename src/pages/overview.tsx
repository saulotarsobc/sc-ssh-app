import {
  Alert,
  Badge,
  Card,
  Container,
  Group,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconClock,
  IconKey,
  IconServer,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useCallback } from "react";
import { HealthCard } from "../components/HealthCard/HealthCard";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { useManagerQuery } from "../hooks/useManagerQuery";

export function OverviewPage() {
  const loader = useCallback(() => window.sshManager.dashboard.summary(), []);
  const { data, loading, error } = useManagerQuery(loader);

  return (
    <Container size="xl" py="xl">
      <PageHeader
        title="Host overview"
        description="Connection health, credential rotation, and recent host activity."
      />
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} mb="lg">
          {error}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
        <Skeleton visible={loading}>
          <HealthCard
            label="Configured hosts"
            value={data?.hostCount ?? 0}
            icon={<IconServer size={24} />}
            color="cyan"
          />
        </Skeleton>
        <Skeleton visible={loading}>
          <HealthCard
            label="Host credentials"
            value={data?.keyCount ?? 0}
            icon={<IconKey size={24} />}
          />
        </Skeleton>
        <Skeleton visible={loading}>
          <HealthCard
            label="Rotation due soon"
            value={data?.dueSoonCount ?? 0}
            icon={<IconClock size={24} />}
            color={data?.dueSoonCount ? "yellow" : "teal"}
          />
        </Skeleton>
        <Skeleton visible={loading}>
          <HealthCard
            label="Critical findings"
            value={data?.criticalCount ?? 0}
            icon={<IconShieldCheck size={24} />}
            color={data?.criticalCount ? "red" : "teal"}
          />
        </Skeleton>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mt="lg">
        <Card withBorder padding="lg">
          <Group justify="space-between" mb="lg">
            <Title order={3}>Environment health</Title>
            <Badge color={data?.criticalCount ? "red" : "teal"}>
              {data?.criticalCount ? "Needs attention" : "Protected"}
            </Badge>
          </Group>
          <Stack gap="md">
            {loading
              ? Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} h={54} />
                ))
              : data?.diagnostics.map((item) => (
                  <Group key={item.id} wrap="nowrap" align="flex-start">
                    <ThemeIcon
                      variant="light"
                      color={
                        item.level === "critical"
                          ? "red"
                          : item.level === "warning"
                            ? "yellow"
                            : "teal"
                      }
                    >
                      {item.level === "healthy" ? (
                        <IconShieldCheck size={18} />
                      ) : (
                        <IconAlertTriangle size={18} />
                      )}
                    </ThemeIcon>
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Group justify="space-between">
                        <Text fw={600}>{item.title}</Text>
                        <Badge
                          size="xs"
                          variant="light"
                          color={
                            item.level === "critical"
                              ? "red"
                              : item.level === "warning"
                                ? "yellow"
                                : "teal"
                          }
                        >
                          {item.level}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {item.message}
                      </Text>
                      {item.resolution && (
                        <Text size="xs" c="cyan">
                          {item.resolution}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                ))}
          </Stack>
        </Card>

        <Card withBorder padding="lg">
          <Group justify="space-between" mb="lg">
            <Title order={3}>Rotation readiness</Title>
            <Text size="sm" c="dimmed">
              90-day policy
            </Text>
          </Group>
          <Text size="sm" c="dimmed" mb="xs">
            Keys within policy
          </Text>
          <Progress
            value={
              data?.keyCount
                ? ((data.keyCount - data.dueSoonCount) / data.keyCount) * 100
                : 100
            }
            color="teal"
            size="lg"
            radius="xl"
            mb="xl"
          />
          <Title order={4} mb="sm">
            Recent activity
          </Title>
          <Table verticalSpacing="sm">
            <Table.Tbody>
              {data?.recentActivity.length ? (
                data.recentActivity.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={entry.outcome === "success" ? "teal" : "red"}
                      >
                        {entry.outcome}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{entry.message}</Text>
                      <Text size="xs" c="dimmed">
                        {new Date(entry.timestamp).toLocaleString()}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      No activity recorded yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Card>
      </SimpleGrid>
    </Container>
  );
}

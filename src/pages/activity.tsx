import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconRefresh,
  IconRobot,
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback } from "react";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { useManagerQuery } from "../hooks/useManagerQuery";
import { action } from "../lib/api";

export function ActivityPage() {
  const activityLoader = useCallback(
    () => window.sshManager.activity.list(250),
    [],
  );
  const agentLoader = useCallback(() => window.sshManager.agent.status(), []);
  const diagnosticsLoader = useCallback(
    () => window.sshManager.diagnostics.run(),
    [],
  );
  const { data: entries = [], reload } = useManagerQuery(activityLoader);
  const { data: agent, reload: reloadAgent } = useManagerQuery(agentLoader);
  const { data: diagnostics = [], reload: reloadDiagnostics } =
    useManagerQuery(diagnosticsLoader);
  return (
    <Container size="xl" py="xl">
      <PageHeader
        title="Activity & diagnostics"
        description="Local, redacted audit history and live OpenSSH health checks."
        actions={
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() =>
              void Promise.all([reload(), reloadAgent(), reloadDiagnostics()])
            }
          >
            Refresh
          </Button>
        }
      />
      <SimpleGrid cols={{ base: 1, lg: 2 }} mb="lg">
        <Card withBorder>
          <Group justify="space-between" mb="lg">
            <Title order={3}>SSH agent</Title>
            <Badge color={agent?.available ? "teal" : "red"}>
              {agent?.available ? "available" : "unavailable"}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            {agent?.message ?? "Checking agent…"}
          </Text>
          <Stack>
            {agent?.identities.map((identity) => (
              <Group key={identity.fingerprint} justify="space-between">
                <Group wrap="nowrap">
                  <ThemeIcon variant="light">
                    <IconRobot size={18} />
                  </ThemeIcon>
                  <div>
                    <Text size="sm" fw={600}>
                      {identity.comment}
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {identity.fingerprint}
                    </Text>
                  </div>
                </Group>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() =>
                    void action(
                      window.sshManager.agent.remove(identity.fingerprint),
                      "Identity removed from agent",
                    )
                  }
                >
                  Remove
                </Button>
              </Group>
            ))}
            {agent?.available && !agent.identities.length && (
              <Alert>The agent is running without loaded identities.</Alert>
            )}
          </Stack>
        </Card>
        <Card withBorder>
          <Title order={3} mb="lg">
            Diagnostics
          </Title>
          <Stack>
            {diagnostics.map((item) => (
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
                <div>
                  <Group gap="xs">
                    <Text fw={600}>{item.title}</Text>
                    <Badge
                      size="xs"
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
                </div>
              </Group>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder>
        <Group justify="space-between" mb="lg">
          <Title order={3}>Audit log</Title>
          <Text size="xs" c="dimmed">
            Passwords and private key material are never recorded.
          </Text>
        </Group>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>Operation</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Outcome</Table.Th>
              <Table.Th>Message</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.map((entry) => (
              <Table.Tr key={entry.id}>
                <Table.Td>
                  <Text size="sm">
                    {new Date(entry.timestamp).toLocaleString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text ff="monospace" size="xs">
                    {entry.operation}
                  </Text>
                </Table.Td>
                <Table.Td>{entry.target ?? "—"}</Table.Td>
                <Table.Td>
                  <Badge color={entry.outcome === "success" ? "teal" : "red"}>
                    {entry.outcome}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{entry.message}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {!entries.length && (
          <Alert mt="md">No manager operations have been recorded yet.</Alert>
        )}
      </Card>
    </Container>
  );
}

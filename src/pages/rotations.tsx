import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Group,
  Modal,
  PasswordInput,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  TagsInput,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconCalendarDue,
  IconCheck,
  IconHistory,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OperationProgress, RotationRun } from "../../shared/contracts";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { ResourcePicker } from "../components/ResourcePicker/ResourcePicker";
import { useManagerQuery } from "../hooks/useManagerQuery";
import { action } from "../lib/api";

export function RotationsPage() {
  const [now] = useState(() => Date.now());
  const [opened, modal] = useDisclosure(false);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [currentProgress, setCurrentProgress] = useState<OperationProgress>();
  const [resultRun, setResultRun] = useState<RotationRun>();
  const hostsLoader = useCallback(() => window.sshManager.hosts.list(), []);
  const keysLoader = useCallback(() => window.sshManager.keys.list(false), []);
  const rotationsLoader = useCallback(
    () => window.sshManager.rotations.list(),
    [],
  );
  const { data: hosts = [] } = useManagerQuery(hostsLoader);
  const { data: keys = [] } = useManagerQuery(keysLoader);
  const { data: runs = [], reload } = useManagerQuery(rotationsLoader);

  useEffect(() => window.sshManager.events.onProgress(setCurrentProgress), []);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      password: "",
      currentPassphrase: "",
      rememberCurrent: false,
      name: "rotation",
      comment: "",
      newPassphrase: "",
      confirmPassphrase: "",
      rememberNew: false,
      allowUnprotected: false,
      revokeOldKey: true,
      tags: [] as string[],
      acceptHostFingerprint: "",
    },
    validate: (values) => ({
      name: /^[a-zA-Z0-9._-]+$/.test(values.name) ? null : "Invalid key name",
      confirmPassphrase:
        values.newPassphrase === values.confirmPassphrase
          ? null
          : "Passphrases do not match",
      allowUnprotected:
        !values.newPassphrase && !values.allowUnprotected
          ? "Confirm creation without a passphrase"
          : null,
    }),
  });

  const dueKeys = useMemo(
    () =>
      keys.filter(
        (key) =>
          key.rotationPolicy.dueAt &&
          new Date(key.rotationPolicy.dueAt).getTime() <= now + 14 * 86_400_000,
      ),
    [keys, now],
  );
  const activeRun = resultRun ?? runs[0];

  const submit = form.onSubmit(async (values) => {
    if (!selectedHost) return;
    const run = await action(
      window.sshManager.rotations.run({
        hostId: selectedHost,
        credentials: {
          password: values.password
            ? { value: values.password, remember: false }
            : undefined,
          passphrase: values.currentPassphrase
            ? {
                value: values.currentPassphrase,
                remember: values.rememberCurrent,
              }
            : undefined,
          acceptHostFingerprint: values.acceptHostFingerprint || undefined,
        },
        newKey: {
          name: values.name,
          algorithm: "ed25519",
          comment: values.comment,
          passphrase: values.newPassphrase
            ? { value: values.newPassphrase, remember: values.rememberNew }
            : undefined,
          tags: values.tags,
          rotationIntervalDays: 90,
          rotationReminderDays: 14,
          allowUnprotected: values.allowUnprotected,
        },
        revokeOldKey: values.revokeOldKey,
      }),
    );
    if (!run) return;
    setResultRun(run);
    modal.close();
    await reload();
  });

  const statusColor = (state: RotationRun["state"]) =>
    state === "completed"
      ? "teal"
      : state === "attention-required" || state === "failed"
        ? "red"
        : state === "rolled-back"
          ? "yellow"
          : "blue";

  return (
    <Container size="xl" py="xl">
      <PageHeader
        title="Key rotations"
        description="Replace remote credentials without creating a window where access can be lost."
        actions={
          <Button
            leftSection={<IconPlayerPlay size={18} />}
            onClick={modal.open}
          >
            Start rotation
          </Button>
        }
      />
      {currentProgress && (
        <Alert color="cyan" mb="lg" title="Rotation in progress">
          {currentProgress.message}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, lg: 3 }} mb="lg">
        <Card withBorder>
          <Group>
            <ThemeIcon color={dueKeys.length ? "yellow" : "teal"} size="xl">
              <IconCalendarDue />
            </ThemeIcon>
            <div>
              <Text c="dimmed">Due within 14 days</Text>
              <Title order={2}>{dueKeys.length}</Title>
            </div>
          </Group>
        </Card>
        <Card withBorder>
          <Group>
            <ThemeIcon color="cyan" size="xl">
              <IconArrowsExchange />
            </ThemeIcon>
            <div>
              <Text c="dimmed">Completed rotations</Text>
              <Title order={2}>
                {runs.filter((run) => run.state === "completed").length}
              </Title>
            </div>
          </Group>
        </Card>
        <Card withBorder>
          <Group>
            <ThemeIcon
              color={
                runs.some((run) => run.state === "attention-required")
                  ? "red"
                  : "teal"
              }
              size="xl"
            >
              <IconAlertTriangle />
            </ThemeIcon>
            <div>
              <Text c="dimmed">Attention required</Text>
              <Title order={2}>
                {
                  runs.filter((run) => run.state === "attention-required")
                    .length
                }
              </Title>
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card withBorder>
          <Title order={3} mb="lg">
            Rotation queue
          </Title>
          <Stack>
            {dueKeys.length ? (
              dueKeys.map((key) => (
                <Group key={key.id} justify="space-between">
                  <div>
                    <Text fw={600}>{key.name}</Text>
                    <Text size="xs" c="dimmed">
                      {key.hostAliases.length
                        ? key.hostAliases.join(", ")
                        : "Not attached to a host"}
                    </Text>
                  </div>
                  <Badge
                    color={
                      new Date(key.rotationPolicy.dueAt!).getTime() <= now
                        ? "red"
                        : "yellow"
                    }
                  >
                    {new Date(key.rotationPolicy.dueAt!).toLocaleDateString()}
                  </Badge>
                </Group>
              ))
            ) : (
              <Alert color="teal" icon={<IconCheck size={18} />}>
                No indexed keys are due for rotation.
              </Alert>
            )}
          </Stack>
        </Card>

        <Card withBorder>
          <Title order={3} mb="lg">
            Latest workflow
          </Title>
          {activeRun ? (
            <>
              <Group justify="space-between" mb="lg">
                <div>
                  <Text fw={700}>{activeRun.hostAlias}</Text>
                  <Text size="xs" c="dimmed">
                    Started {new Date(activeRun.startedAt).toLocaleString()}
                  </Text>
                </div>
                <Badge color={statusColor(activeRun.state)}>
                  {activeRun.state}
                </Badge>
              </Group>
              <Stepper
                active={Math.max(
                  0,
                  activeRun.steps.filter(
                    (step) =>
                      step.state === "completed" || step.state === "skipped",
                  ).length,
                )}
                orientation="vertical"
                size="sm"
              >
                {activeRun.steps.map((step) => (
                  <Stepper.Step
                    key={step.id}
                    label={step.label}
                    description={step.message}
                    color={step.state === "failed" ? "red" : "teal"}
                  />
                ))}
              </Stepper>
              {activeRun.error && (
                <Alert color="red" mt="md">
                  {activeRun.error}
                </Alert>
              )}
            </>
          ) : (
            <Text c="dimmed">No rotations have been attempted yet.</Text>
          )}
        </Card>
      </SimpleGrid>

      <Card withBorder mt="lg">
        <Title order={3} mb="md">
          History
        </Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Host</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Completed</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {runs.map((run) => (
              <Table.Tr key={run.id}>
                <Table.Td>{run.hostAlias}</Table.Td>
                <Table.Td>{new Date(run.startedAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  {run.completedAt
                    ? new Date(run.completedAt).toLocaleString()
                    : "—"}
                </Table.Td>
                <Table.Td>
                  <Badge color={statusColor(run.state)}>{run.state}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal
        opened={opened}
        onClose={modal.close}
        title="Rotate host key"
        size="lg"
      >
        <form onSubmit={submit}>
          <Stack>
            <Alert color="cyan" icon={<IconHistory size={18} />}>
              The old key remains valid until the replacement is installed,
              tested, and selected locally.
            </Alert>
            <ResourcePicker
              label="Host"
              placeholder="Search a simple host profile"
              value={selectedHost}
              onChange={(value) => {
                setSelectedHost(value);
                const host = hosts.find((item) => item.id === value);
                if (host) form.setFieldValue("name", `${host.alias}_rotation`);
              }}
              options={hosts
                .filter((host) => host.simple && host.keyId)
                .map((host) => ({
                  value: host.id,
                  label: host.alias,
                  description: `${host.user}@${host.hostname}:${host.port}`,
                }))}
            />
            <DividerLabel label="Current access" />
            <PasswordInput
              key={form.key("currentPassphrase")}
              label="Current key passphrase"
              description="Leave empty to use the operating system vault."
              {...form.getInputProps("currentPassphrase")}
            />
            <Checkbox
              key={form.key("rememberCurrent")}
              label="Remember current passphrase"
              {...form.getInputProps("rememberCurrent", { type: "checkbox" })}
            />
            <PasswordInput
              key={form.key("password")}
              label="Server password fallback"
              {...form.getInputProps("password")}
            />
            <TextInput
              key={form.key("acceptHostFingerprint")}
              label="Trusted host fingerprint"
              description="Only needed for a host not already present in known_hosts."
              placeholder="SHA256:…"
              {...form.getInputProps("acceptHostFingerprint")}
            />
            <DividerLabel label="Replacement key" />
            <TextInput
              key={form.key("name")}
              label="Key name"
              {...form.getInputProps("name")}
            />
            <TextInput
              key={form.key("comment")}
              label="Comment"
              {...form.getInputProps("comment")}
            />
            <TagsInput
              key={form.key("tags")}
              label="Tags"
              {...form.getInputProps("tags")}
            />
            <PasswordInput
              key={form.key("newPassphrase")}
              label="New passphrase"
              {...form.getInputProps("newPassphrase")}
            />
            <PasswordInput
              key={form.key("confirmPassphrase")}
              label="Confirm new passphrase"
              {...form.getInputProps("confirmPassphrase")}
            />
            <Checkbox
              key={form.key("rememberNew")}
              label="Remember new passphrase in the operating system vault"
              {...form.getInputProps("rememberNew", { type: "checkbox" })}
            />
            <Checkbox
              key={form.key("allowUnprotected")}
              color="yellow"
              label="I understand that an empty passphrase leaves the new key unprotected"
              {...form.getInputProps("allowUnprotected", { type: "checkbox" })}
            />
            <Checkbox
              key={form.key("revokeOldKey")}
              label="Revoke the old key after the new connection succeeds"
              {...form.getInputProps("revokeOldKey", { type: "checkbox" })}
            />
            <Alert color="yellow">
              Remote changes are backed up as{" "}
              <Code>authorized_keys.sc-ssh-backup.*</Code>.
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={modal.close}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={form.submitting}
                disabled={!selectedHost}
              >
                Start safe rotation
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}

function DividerLabel({ label }: { label: string }) {
  return (
    <Group gap="sm" mt="sm">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        {label}
      </Text>
      <div
        style={{
          height: 1,
          background: "var(--mantine-color-dark-4)",
          flex: 1,
        }}
      />
    </Group>
  );
}

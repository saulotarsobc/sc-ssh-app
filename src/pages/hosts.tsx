import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  PasswordInput,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBinaryTree,
  IconBraces,
  IconDeviceDesktop,
  IconDots,
  IconEdit,
  IconHistory,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconServer,
  IconSortAscending,
  IconTerminal2,
  IconTrash,
} from "@tabler/icons-react";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useState } from "react";
import type {
  ConfigPreview,
  ConfigSnapshot,
  HostRecord,
} from "../../shared/contracts";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { ResourcePicker } from "../components/ResourcePicker/ResourcePicker";
import { useManagerQuery } from "../hooks/useManagerQuery";
import { action, unwrap } from "../lib/api";

interface HostValues {
  id?: string;
  alias: string;
  hostname: string;
  port: number;
  user: string;
  keyId: string;
  identitiesOnly: boolean;
  serverAliveInterval: number | string;
  additionalDirectives: string;
}

const directivesFromText = (value: string): Record<string, string> =>
  Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split(/\s+/);
        return [key, rest.join(" ")];
      }),
  );

export function HostsPage() {
  const [activeTab, setActiveTab] = useState<string | null>("hosts");
  const [hostOpened, hostModal] = useDisclosure(false);
  const [testHost, setTestHost] = useState<HostRecord>();
  const [rawConfig, setRawConfig] = useState("");
  const [preview, setPreview] = useState<ConfigPreview>();
  const [backups, setBackups] = useState<ConfigSnapshot[]>([]);
  const [unknownFingerprint, setUnknownFingerprint] = useState("");
  const [trustUnknownHost, setTrustUnknownHost] = useState(false);
  const hostsLoader = useCallback(() => window.sshManager.hosts.list(), []);
  const keysLoader = useCallback(() => window.sshManager.keys.list(false), []);
  const {
    data: hosts = [],
    loading,
    error,
    reload,
  } = useManagerQuery(hostsLoader);
  const { data: keys = [] } = useManagerQuery(keysLoader);

  const hostForm = useForm<HostValues>({
    mode: "uncontrolled",
    initialValues: {
      alias: "",
      hostname: "",
      port: 22,
      user: "",
      keyId: "",
      identitiesOnly: true,
      serverAliveInterval: 60,
      additionalDirectives: "",
    },
    validate: {
      alias: (value) =>
        /^[a-zA-Z0-9._-]{1,64}$/.test(value) ? null : "Invalid SSH alias",
      hostname: (value) =>
        /^[a-zA-Z0-9:._-]+$/.test(value)
          ? null
          : "Invalid hostname or IP address",
      port: (value) =>
        value >= 1 && value <= 65535
          ? null
          : "Port must be between 1 and 65535",
      user: (value) => (value.trim() ? null : "Username is required"),
      keyId: (value) => (value ? null : "Choose an SSH key"),
    },
  });
  const credentialsForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      password: "",
      passphrase: "",
      rememberPassword: false,
      rememberPassphrase: false,
      acceptHostFingerprint: "",
    },
  });

  const loadConfig = useCallback(async () => {
    try {
      setRawConfig(unwrap(await window.sshManager.config.read()));
    } catch {
      setRawConfig("");
    }
  }, []);
  const loadBackups = useCallback(async () => {
    try {
      setBackups(unwrap(await window.sshManager.config.backups()));
    } catch {
      setBackups([]);
    }
  }, []);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadConfig();
      void loadBackups();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadBackups, loadConfig]);

  const openCreate = () => {
    hostForm.reset();
    hostModal.open();
  };
  const openEdit = (host: HostRecord) => {
    hostForm.setValues({
      id: host.id,
      alias: host.alias,
      hostname: host.hostname,
      port: host.port,
      user: host.user,
      keyId: host.keyId ?? "",
      identitiesOnly: host.identitiesOnly,
      serverAliveInterval: host.serverAliveInterval ?? "",
      additionalDirectives: Object.entries(host.additionalDirectives)
        .map(([key, value]) => `${key} ${value}`)
        .join("\n"),
    });
    hostForm.resetDirty();
    hostModal.open();
  };

  const submitHost = hostForm.onSubmit(async (values) => {
    await action(
      window.sshManager.hosts.save({
        id: values.id,
        alias: values.alias,
        hostname: values.hostname,
        port: Number(values.port),
        user: values.user,
        keyId: values.keyId,
        identitiesOnly: values.identitiesOnly,
        serverAliveInterval:
          values.serverAliveInterval === ""
            ? undefined
            : Number(values.serverAliveInterval),
        additionalDirectives: directivesFromText(values.additionalDirectives),
      }),
      values.id ? "Host updated" : "Host created",
    );
    hostModal.close();
    await Promise.all([reload(), loadConfig()]);
  });

  const runTest = credentialsForm.onSubmit(async (values) => {
    if (!testHost) return;
    const result = await action(
      window.sshManager.hosts.test(testHost.id, {
        password: values.password
          ? { value: values.password, remember: values.rememberPassword }
          : undefined,
        passphrase: values.passphrase
          ? { value: values.passphrase, remember: values.rememberPassphrase }
          : undefined,
        acceptHostFingerprint: trustUnknownHost
          ? unknownFingerprint
          : values.acceptHostFingerprint || undefined,
      }),
    );
    if (!result) return;
    if (
      !result.success &&
      result.category === "host-key" &&
      result.hostFingerprint &&
      !values.acceptHostFingerprint
    ) {
      setUnknownFingerprint(result.hostFingerprint);
      setTrustUnknownHost(false);
      return;
    }
    if (result.success) {
      setUnknownFingerprint("");
      setTrustUnknownHost(false);
      setTestHost(undefined);
    }
  });

  return (
    <Container size="xl" py="xl">
      <PageHeader
        title="Hosts & config"
        description="Manage connection profiles without losing the semantics of your OpenSSH config."
        actions={
          <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
            Add host
          </Button>
        }
      />
      {error && (
        <Alert color="red" mb="lg">
          {error}
        </Alert>
      )}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="hosts" leftSection={<IconServer size={16} />}>
            Hosts
          </Tabs.Tab>
          <Tabs.Tab value="raw" leftSection={<IconBraces size={16} />}>
            Raw config
          </Tabs.Tab>
          <Tabs.Tab value="backups" leftSection={<IconHistory size={16} />}>
            Backups
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="hosts">
          {loading ? (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} h={190} />
              ))}
            </SimpleGrid>
          ) : hosts.length ? (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {hosts.map((host) => (
                <Card key={host.id} withBorder padding="lg">
                  <Group justify="space-between" align="flex-start">
                    <Group>
                      <IconDeviceDesktop color="var(--mantine-color-cyan-5)" />
                      <div>
                        <Text fw={700}>{host.alias}</Text>
                        <Text size="sm" c="dimmed">
                          {host.user}@{host.hostname}:{host.port}
                        </Text>
                      </div>
                    </Group>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle">
                          <IconDots size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={16} />}
                          disabled={!host.simple}
                          onClick={() => openEdit(host)}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconPlayerPlay size={16} />}
                          onClick={() => {
                            credentialsForm.reset();
                            setUnknownFingerprint("");
                            setTrustUnknownHost(false);
                            setTestHost(host);
                          }}
                        >
                          Test connection
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconTerminal2 size={16} />}
                          onClick={() =>
                            void action(
                              window.sshManager.hosts.openTerminal(host.id),
                            )
                          }
                        >
                          Open terminal
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          disabled={!host.simple}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${host.alias} from SSH config?`,
                              )
                            )
                              void action(
                                window.sshManager.hosts.remove(host.id),
                                "Host removed",
                              );
                          }}
                        >
                          Remove
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                  <Divider my="md" />
                  <Group gap="xs">
                    <Badge color={host.simple ? "teal" : "yellow"}>
                      {host.simple ? "guided" : "complex"}
                    </Badge>
                    <Badge variant="light">
                      {host.identitiesOnly
                        ? "identities only"
                        : "fallback identities"}
                    </Badge>
                  </Group>
                  <Text size="xs" ff="monospace" c="dimmed" mt="md" truncate>
                    {host.identityFile || "No IdentityFile directive"}
                  </Text>
                  {host.issues.length > 0 && (
                    <Alert
                      color={
                        host.issues.some((issue) =>
                          issue.startsWith("Duplicate"),
                        )
                          ? "red"
                          : "yellow"
                      }
                      mt="md"
                      p="xs"
                    >
                      <Text size="xs">{host.issues.join(" · ")}</Text>
                    </Alert>
                  )}
                </Card>
              ))}
            </SimpleGrid>
          ) : (
            <Card withBorder p="xl">
              <Stack align="center">
                <IconBinaryTree size={42} />
                <Title order={3}>No host profiles yet</Title>
                <Text c="dimmed">
                  Add a guided host or edit your OpenSSH config directly.
                </Text>
                <Button onClick={openCreate}>Add host</Button>
              </Stack>
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="raw">
          <Card withBorder p={0} style={{ overflow: "hidden" }}>
            <Group justify="space-between" p="md">
              <div>
                <Text fw={700}>OpenSSH config</Text>
                <Text size="xs" c="dimmed">
                  Every save is validated and backed up.
                </Text>
              </div>
              <Group>
                <Button
                  variant="default"
                  leftSection={<IconRefresh size={16} />}
                  onClick={() => void loadConfig()}
                >
                  Reload
                </Button>
                <Button
                  variant="light"
                  leftSection={<IconSortAscending size={16} />}
                  onClick={async () =>
                    setPreview(
                      await action(window.sshManager.config.previewOrganize()),
                    )
                  }
                >
                  Organize
                </Button>
                <Button
                  onClick={async () =>
                    setPreview(
                      await action(window.sshManager.config.preview(rawConfig)),
                    )
                  }
                >
                  Review changes
                </Button>
              </Group>
            </Group>
            <CodeMirror
              value={rawConfig}
              height="520px"
              theme="dark"
              onChange={setRawConfig}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                foldGutter: false,
              }}
            />
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="backups">
          <Stack>
            {backups.length ? (
              backups.map((backup) => (
                <Card key={backup.id} withBorder>
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>{backup.reason}</Text>
                      <Text size="xs" c="dimmed">
                        {new Date(backup.createdAt).toLocaleString()} ·{" "}
                        {backup.size} bytes · {backup.checksum.slice(0, 16)}…
                      </Text>
                    </div>
                    <Button
                      variant="light"
                      leftSection={<IconRestore size={16} />}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Restore this config backup? A backup of the current file will be created first.",
                          )
                        )
                          void action(
                            window.sshManager.config.restore(backup.id),
                            "Backup restored",
                          );
                      }}
                    >
                      Restore
                    </Button>
                  </Group>
                </Card>
              ))
            ) : (
              <Alert>No config backups have been created yet.</Alert>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={hostOpened}
        onClose={hostModal.close}
        title={hostForm.getValues().id ? "Edit host" : "Add host"}
        size="lg"
      >
        <form onSubmit={submitHost}>
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                key={hostForm.key("alias")}
                label="Alias"
                placeholder="production"
                {...hostForm.getInputProps("alias")}
              />
              <TextInput
                key={hostForm.key("hostname")}
                label="Hostname or IP"
                placeholder="server.example.com"
                {...hostForm.getInputProps("hostname")}
              />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                key={hostForm.key("user")}
                label="Username"
                {...hostForm.getInputProps("user")}
              />
              <NumberInput
                key={hostForm.key("port")}
                label="Port"
                min={1}
                max={65535}
                {...hostForm.getInputProps("port")}
              />
            </SimpleGrid>
            <ResourcePicker
              label="SSH key"
              placeholder="Search indexed keys"
              value={hostForm.getValues().keyId || null}
              onChange={(value) => hostForm.setFieldValue("keyId", value ?? "")}
              error={hostForm.errors.keyId as string | undefined}
              options={keys
                .filter((key) => key.status === "active")
                .map((key) => ({
                  value: key.id,
                  label: key.name,
                  description: key.fingerprint,
                  group: key.algorithm,
                }))}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Switch
                key={hostForm.key("identitiesOnly")}
                label="Use only this identity"
                {...hostForm.getInputProps("identitiesOnly", {
                  type: "checkbox",
                })}
              />
              <NumberInput
                key={hostForm.key("serverAliveInterval")}
                label="Keepalive interval"
                suffix=" s"
                min={0}
                {...hostForm.getInputProps("serverAliveInterval")}
              />
            </SimpleGrid>
            <Textarea
              key={hostForm.key("additionalDirectives")}
              label="Additional directives"
              description="One OpenSSH directive per line. Unknown directives are preserved."
              autosize
              minRows={3}
              {...hostForm.getInputProps("additionalDirectives")}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={hostModal.close}>
                Cancel
              </Button>
              <Button type="submit" loading={hostForm.submitting}>
                Save host
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(testHost)}
        onClose={() => {
          setUnknownFingerprint("");
          setTrustUnknownHost(false);
          setTestHost(undefined);
        }}
        title={`Test ${testHost?.alias ?? "host"}`}
      >
        <form onSubmit={runTest}>
          <Stack>
            <PasswordInput
              key={credentialsForm.key("passphrase")}
              label="Key passphrase"
              description="Leave empty to use the operating system vault."
              {...credentialsForm.getInputProps("passphrase")}
            />
            <Checkbox
              key={credentialsForm.key("rememberPassphrase")}
              label="Remember key passphrase"
              {...credentialsForm.getInputProps("rememberPassphrase", {
                type: "checkbox",
              })}
            />
            <PasswordInput
              key={credentialsForm.key("password")}
              label="Server password fallback"
              {...credentialsForm.getInputProps("password")}
            />
            <Checkbox
              key={credentialsForm.key("rememberPassword")}
              label="Remember server password"
              {...credentialsForm.getInputProps("rememberPassword", {
                type: "checkbox",
              })}
            />
            {unknownFingerprint && (
              <Alert color="yellow" title="Unknown host key">
                Verify this fingerprint out of band before trusting it:
                <br />
                <Code>{unknownFingerprint}</Code>
                <Checkbox
                  mt="sm"
                  label="Trust this fingerprint and retry"
                  checked={trustUnknownHost}
                  onChange={(event) =>
                    setTrustUnknownHost(event.currentTarget.checked)
                  }
                />
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setTestHost(undefined)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={credentialsForm.submitting}
                disabled={Boolean(unknownFingerprint) && !trustUnknownHost}
              >
                Test connection
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(preview)}
        onClose={() => setPreview(undefined)}
        title="Review SSH config changes"
        size="90%"
      >
        {preview && (
          <Stack>
            {!preview.valid && <Alert color="red">{preview.error}</Alert>}
            {preview.warnings.map((warning) => (
              <Alert key={warning} color="yellow">
                {warning}
              </Alert>
            ))}
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <div>
                <Text fw={600} mb="xs">
                  Current
                </Text>
                <ScrollArea h={420}>
                  <Code block>{preview.original || "(empty)"}</Code>
                </ScrollArea>
              </div>
              <div>
                <Text fw={600} mb="xs">
                  Proposed
                </Text>
                <ScrollArea h={420}>
                  <Code block>{preview.proposed || "(empty)"}</Code>
                </ScrollArea>
              </div>
            </SimpleGrid>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPreview(undefined)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !preview.valid ||
                  (!preview.semanticEquivalent &&
                    preview.proposed !== rawConfig)
                }
                onClick={async () => {
                  await action(
                    window.sshManager.config.apply(
                      preview.proposed,
                      "Raw config editor update",
                    ),
                    "SSH config updated",
                  );
                  setRawConfig(preview.proposed);
                  setPreview(undefined);
                  await loadBackups();
                }}
              >
                Apply changes
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}

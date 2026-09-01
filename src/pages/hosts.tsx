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
  IconKey,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconRocket,
  IconSearch,
  IconServer,
  IconSortAscending,
  IconTerminal2,
  IconTrash,
} from "@tabler/icons-react";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  ConfigPreview,
  ConfigSnapshot,
  HostRecord,
} from "../../shared/contracts";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { useManagerQuery } from "../hooks/useManagerQuery";
import { action, unwrap } from "../lib/api";

interface HostValues {
  id?: string;
  alias: string;
  hostname: string;
  port: number;
  user: string;
  keyId: string;
  identityFile: string;
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("hosts");
  const [search, setSearch] = useState("");
  const [hostOpened, hostModal] = useDisclosure(false);
  const [setupOpened, setupModal] = useDisclosure(false);
  const [testHost, setTestHost] = useState<HostRecord>();
  const [deployHost, setDeployHost] = useState<HostRecord>();
  const [rawConfig, setRawConfig] = useState("");
  const [preview, setPreview] = useState<ConfigPreview>();
  const [backups, setBackups] = useState<ConfigSnapshot[]>([]);
  const [unknownFingerprint, setUnknownFingerprint] = useState("");
  const [trustUnknownHost, setTrustUnknownHost] = useState(false);
  const [setupFingerprint, setSetupFingerprint] = useState("");
  const [trustSetupHost, setTrustSetupHost] = useState(false);
  const [deployFingerprint, setDeployFingerprint] = useState("");
  const [trustDeployHost, setTrustDeployHost] = useState(false);
  const hostsLoader = useCallback(() => window.sshManager.hosts.list(), []);
  const {
    data: hosts = [],
    loading,
    error,
    reload,
  } = useManagerQuery(hostsLoader);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredHosts = hosts.filter((host) =>
    [
      host.alias,
      host.hostname,
      host.user,
      host.identityFile ?? "",
      host.key?.fingerprint ?? "",
      ...host.issues,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch),
  );

  const hostForm = useForm<HostValues>({
    mode: "uncontrolled",
    initialValues: {
      alias: "",
      hostname: "",
      port: 22,
      user: "",
      keyId: "",
      identityFile: "",
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
    },
  });
  const credentialsForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      passphrase: "",
      rememberPassphrase: false,
      acceptHostFingerprint: "",
    },
  });
  const setupForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      alias: "",
      hostname: "",
      port: 22,
      user: "root",
      password: "",
      algorithm: "ed25519" as "ed25519" | "rsa",
      comment: "",
      passphrase: "",
      confirmPassphrase: "",
      allowUnprotected: false,
    },
    validate: (values) => ({
      alias: /^[a-zA-Z0-9._-]{1,64}$/.test(values.alias)
        ? null
        : "Use letters, numbers, dots, dashes, or underscores",
      hostname: /^[a-zA-Z0-9:._-]+$/.test(values.hostname)
        ? null
        : "Invalid hostname or IP address",
      port:
        values.port >= 1 && values.port <= 65535
          ? null
          : "Port must be between 1 and 65535",
      user: values.user.trim() ? null : "Username is required",
      password: values.password ? null : "Password is required for setup",
      confirmPassphrase:
        values.passphrase === values.confirmPassphrase
          ? null
          : "Passphrases do not match",
      allowUnprotected:
        !values.passphrase && !values.allowUnprotected
          ? "Confirm creation without a passphrase"
          : null,
    }),
  });
  const deployForm = useForm({
    mode: "uncontrolled",
    initialValues: { password: "", passphrase: "" },
    validate: {
      password: (value) => (value ? null : "Enter the current server password"),
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
    setupForm.reset();
    setSetupFingerprint("");
    setTrustSetupHost(false);
    setupModal.open();
  };
  const openEdit = (host: HostRecord) => {
    hostForm.setValues({
      id: host.id,
      alias: host.alias,
      hostname: host.hostname,
      port: host.port,
      user: host.user,
      keyId: host.keyId ?? "",
      identityFile: host.identityFile ?? "",
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
        keyId: values.keyId || undefined,
        identityFile: values.identityFile || undefined,
        identitiesOnly: true,
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

  const submitSetup = setupForm.onSubmit(async (values) => {
    const result = await window.sshManager.hosts.setup({
      alias: values.alias,
      hostname: values.hostname,
      port: Number(values.port),
      user: values.user,
      password: { value: values.password, remember: false },
      algorithm: values.algorithm,
      comment: values.comment,
      passphrase: values.passphrase
        ? { value: values.passphrase, remember: false }
        : undefined,
      allowUnprotected: values.allowUnprotected,
      acceptHostFingerprint: trustSetupHost ? setupFingerprint : undefined,
    });
    if (!result.ok && result.error.code === "HOST_KEY_UNKNOWN") {
      setSetupFingerprint(result.error.details ?? "");
      setTrustSetupHost(false);
      return;
    }
    await action(
      Promise.resolve(result),
      `Passwordless access to ${values.alias} is ready`,
    );
    setupForm.reset();
    setupModal.close();
    await Promise.all([reload(), loadConfig()]);
  });

  const submitDeploy = deployForm.onSubmit(async (values) => {
    if (!deployHost) return;
    const result = await window.sshManager.hosts.installKey(deployHost.id, {
      password: { value: values.password, remember: false },
      passphrase: values.passphrase
        ? { value: values.passphrase, remember: false }
        : undefined,
      acceptHostFingerprint: trustDeployHost ? deployFingerprint : undefined,
    });
    if (!result.ok && result.error.code === "HOST_KEY_UNKNOWN") {
      setDeployFingerprint(result.error.details ?? "");
      setTrustDeployHost(false);
      return;
    }
    await action(
      Promise.resolve(result),
      `Passwordless access to ${deployHost.alias} is ready`,
    );
    deployForm.reset();
    setDeployHost(undefined);
    await Promise.all([reload(), loadConfig()]);
  });

  const runTest = credentialsForm.onSubmit(async (values) => {
    if (!testHost) return;
    const result = await action(
      window.sshManager.hosts.test(testHost.id, {
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
        title="SSH hosts"
        description="Add a server once, then connect with its alias. Keys are managed automatically."
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
            Advanced config
          </Tabs.Tab>
          <Tabs.Tab value="backups" leftSection={<IconHistory size={16} />}>
            Backups
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="hosts">
          <TextInput
            mb="lg"
            maw={460}
            leftSection={<IconSearch size={17} />}
            placeholder="Search hosts by alias, address, or user"
            aria-label="Search hosts"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          {loading ? (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} h={190} />
              ))}
            </SimpleGrid>
          ) : filteredHosts.length ? (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {filteredHosts.map((host) => (
                <Card key={host.id} withBorder padding="lg">
                  <Group justify="space-between" align="flex-start">
                    <Group>
                      <IconDeviceDesktop color="var(--mantine-color-cyan-5)" />
                      <div>
                        <Group gap="xs">
                          <Text fw={700}>{host.alias}</Text>
                          <Badge
                            size="xs"
                            color={host.key ? "teal" : "yellow"}
                            variant="light"
                          >
                            {host.key ? "identity configured" : "key missing"}
                          </Badge>
                        </Group>
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
                          leftSection={<IconRefresh size={16} />}
                          disabled={!host.keyId || !host.simple}
                          onClick={() =>
                            navigate(
                              `/rotations?host=${encodeURIComponent(host.id)}`,
                            )
                          }
                        >
                          Rotate access key
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          disabled={!host.simple}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${host.alias}? Its dedicated key will be archived for recovery.`,
                              )
                            ) {
                              void (async () => {
                                await action(
                                  window.sshManager.hosts.remove(host.id),
                                  "Host removed",
                                );
                                await Promise.all([reload(), loadConfig()]);
                              })();
                            }
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
                  {host.key && (
                    <Group justify="space-between" mt="md" gap="xs">
                      <Text size="xs" c="dimmed">
                        {host.key.algorithm.toUpperCase()} ·{" "}
                        {host.key.encrypted ? "protected" : "no passphrase"}
                      </Text>
                      <Text size="xs" ff="monospace" c="dimmed">
                        {host.key.fingerprint.slice(0, 20)}…
                      </Text>
                    </Group>
                  )}
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
                  <Group grow mt="md">
                    <Button
                      variant="light"
                      leftSection={<IconKey size={17} />}
                      disabled={!host.keyId}
                      onClick={() => {
                        deployForm.reset();
                        setDeployFingerprint("");
                        setTrustDeployHost(false);
                        setDeployHost(host);
                      }}
                    >
                      Enable access
                    </Button>
                    <Button
                      leftSection={<IconTerminal2 size={17} />}
                      onClick={() =>
                        void action(
                          window.sshManager.hosts.openTerminal(host.id),
                          `Opened terminal for ${host.alias}`,
                        )
                      }
                    >
                      Connect
                    </Button>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          ) : (
            <Card withBorder p="xl">
              <Stack align="center">
                {search ? (
                  <IconSearch size={42} />
                ) : (
                  <IconBinaryTree size={42} />
                )}
                <Title order={3}>
                  {search ? "No matching hosts" : "No host profiles yet"}
                </Title>
                <Text c="dimmed">
                  {search
                    ? `No hosts match “${search}”.`
                    : "Add a host and the app will create, install, and configure its key."}
                </Text>
                <Button onClick={search ? () => setSearch("") : openCreate}>
                  {search ? "Clear search" : "Add host"}
                </Button>
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
        opened={setupOpened}
        onClose={() => {
          setSetupFingerprint("");
          setTrustSetupHost(false);
          setupModal.close();
        }}
        title="Add SSH host"
        size="lg"
      >
        <form onSubmit={submitSetup}>
          <Stack>
            <Alert color="teal" icon={<IconRocket size={18} />}>
              One server, one key. The app generates the key, installs it,
              writes SSH config, and verifies <Code>ssh alias</Code>.
            </Alert>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                key={setupForm.key("alias")}
                label="Alias"
                placeholder="production"
                {...setupForm.getInputProps("alias")}
              />
              <TextInput
                key={setupForm.key("hostname")}
                label="Hostname or IP"
                placeholder="server.example.com"
                {...setupForm.getInputProps("hostname")}
              />
              <TextInput
                key={setupForm.key("user")}
                label="Username"
                {...setupForm.getInputProps("user")}
              />
              <NumberInput
                key={setupForm.key("port")}
                label="Port"
                min={1}
                max={65535}
                {...setupForm.getInputProps("port")}
              />
            </SimpleGrid>
            <PasswordInput
              key={setupForm.key("password")}
              label="Current server password"
              description="Used once to install the public key. It is not stored."
              {...setupForm.getInputProps("password")}
            />
            <Text size="sm" c="dimmed">
              A dedicated ED25519 identity will be created automatically for
              this host.
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <PasswordInput
                key={setupForm.key("passphrase")}
                label="Key passphrase"
                {...setupForm.getInputProps("passphrase")}
              />
              <PasswordInput
                key={setupForm.key("confirmPassphrase")}
                label="Confirm key passphrase"
                {...setupForm.getInputProps("confirmPassphrase")}
              />
            </SimpleGrid>
            <Checkbox
              key={setupForm.key("allowUnprotected")}
              color="yellow"
              label="I understand that an empty passphrase leaves the private key unprotected"
              {...setupForm.getInputProps("allowUnprotected", {
                type: "checkbox",
              })}
            />
            {setupFingerprint && (
              <Alert color="yellow" title="Verify this server fingerprint">
                <Code>{setupFingerprint}</Code>
                <Checkbox
                  mt="sm"
                  checked={trustSetupHost}
                  label="I verified this fingerprint and trust this server"
                  onChange={(event) =>
                    setTrustSetupHost(event.currentTarget.checked)
                  }
                />
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={setupModal.close}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={setupForm.submitting}
                disabled={Boolean(setupFingerprint) && !trustSetupHost}
                leftSection={<IconRocket size={17} />}
              >
                Add host
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(deployHost)}
        onClose={() => {
          setDeployFingerprint("");
          setTrustDeployHost(false);
          setDeployHost(undefined);
        }}
        title={`Enable passwordless access to ${deployHost?.alias ?? "host"}`}
      >
        <form onSubmit={submitDeploy}>
          <Stack>
            <Text c="dimmed" size="sm">
              The configured public key will be added to the server and tested
              before this operation succeeds.
            </Text>
            <PasswordInput
              key={deployForm.key("password")}
              label="Current server password"
              description="Used once and never stored."
              {...deployForm.getInputProps("password")}
            />
            {deployFingerprint && (
              <Alert color="yellow" title="Verify this server fingerprint">
                <Code>{deployFingerprint}</Code>
                <Checkbox
                  mt="sm"
                  checked={trustDeployHost}
                  label="I verified this fingerprint and trust this server"
                  onChange={(event) =>
                    setTrustDeployHost(event.currentTarget.checked)
                  }
                />
              </Alert>
            )}
            <PasswordInput
              key={deployForm.key("passphrase")}
              label="Key passphrase"
              description="Leave empty if this key has no passphrase."
              {...deployForm.getInputProps("passphrase")}
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => setDeployHost(undefined)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={deployForm.submitting}
                disabled={Boolean(deployFingerprint) && !trustDeployHost}
              >
                Enable access
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

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
            <Alert color="teal">
              This host keeps its dedicated key. Editing connection details does
              not replace the identity.
            </Alert>
            <NumberInput
              key={hostForm.key("serverAliveInterval")}
              label="Keepalive interval"
              suffix=" s"
              min={0}
              {...hostForm.getInputProps("serverAliveInterval")}
            />
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

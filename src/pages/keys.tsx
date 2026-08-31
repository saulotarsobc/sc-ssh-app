import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Menu,
  Modal,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import {
  IconArchive,
  IconCopy,
  IconDots,
  IconDownload,
  IconEdit,
  IconFileImport,
  IconFolderOpen,
  IconKey,
  IconPlus,
  IconRestore,
  IconRobot,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";
import type { KeyAlgorithm, SshKeyRecord } from "../../shared/contracts";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { useManagerQuery } from "../hooks/useManagerQuery";
import { action } from "../lib/api";

interface CreateValues {
  name: string;
  algorithm: "ed25519" | "rsa";
  comment: string;
  passphrase: string;
  confirmPassphrase: string;
  remember: boolean;
  allowUnprotected: boolean;
  tags: string[];
}

const algorithmColor = (algorithm: KeyAlgorithm) =>
  algorithm === "ed25519"
    ? "teal"
    : algorithm === "rsa"
      ? "blue"
      : algorithm === "unknown" || algorithm === "dsa"
        ? "red"
        : "grape";

export function KeysPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpened, createModal] = useDisclosure(false);
  const [importOpened, importModal] = useDisclosure(false);
  const [editing, setEditing] = useState<SshKeyRecord>();
  const loader = useCallback(
    () => window.sshManager.keys.list(includeArchived),
    [includeArchived],
  );
  const { data = [], loading, error, reload } = useManagerQuery(loader);

  const createForm = useForm<CreateValues>({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      algorithm: "ed25519",
      comment: "",
      passphrase: "",
      confirmPassphrase: "",
      remember: false,
      allowUnprotected: false,
      tags: [],
    },
    validate: (values) => ({
      name: /^[a-zA-Z0-9._-]{1,64}$/.test(values.name)
        ? null
        : "Use letters, numbers, dots, dashes, or underscores",
      confirmPassphrase:
        values.passphrase === values.confirmPassphrase
          ? null
          : "Passphrases do not match",
      allowUnprotected:
        !values.passphrase && !values.allowUnprotected
          ? "Confirm that this key will be unprotected"
          : null,
    }),
  });
  const importForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      path: "",
      name: "",
      passphrase: "",
      remember: false,
      tags: [] as string[],
    },
    validate: { path: (value) => (value ? null : "Choose a private key file") },
  });
  const editForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      tags: [] as string[],
      enabled: true,
      intervalDays: 90,
      reminderDays: 14,
    },
    validate: {
      name: (value) => (value.trim() ? null : "Name is required"),
      intervalDays: (value) => (value >= 1 ? null : "Must be at least one day"),
    },
  });

  const filtered = data.filter((key) =>
    `${key.name} ${key.comment} ${key.fingerprint} ${key.tags.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const submitCreate = createForm.onSubmit(async (values) => {
    await action(
      window.sshManager.keys.create({
        name: values.name,
        algorithm: values.algorithm,
        comment: values.comment,
        passphrase: values.passphrase
          ? { value: values.passphrase, remember: values.remember }
          : undefined,
        tags: values.tags,
        rotationIntervalDays: 90,
        rotationReminderDays: 14,
        allowUnprotected: values.allowUnprotected,
      }),
      "SSH key created",
    );
    createForm.reset();
    createModal.close();
    await reload();
  });

  const submitImport = importForm.onSubmit(async (values) => {
    await action(
      window.sshManager.keys.import({
        path: values.path,
        name: values.name || undefined,
        passphrase: values.passphrase
          ? { value: values.passphrase, remember: values.remember }
          : undefined,
        tags: values.tags,
        rotationIntervalDays: 90,
        rotationReminderDays: 14,
      }),
      "SSH key imported",
    );
    importForm.reset();
    importModal.close();
    await reload();
  });

  const openEdit = (key: SshKeyRecord) => {
    setEditing(key);
    editForm.setValues({
      name: key.name,
      tags: key.tags,
      enabled: key.rotationPolicy.enabled,
      intervalDays: key.rotationPolicy.intervalDays,
      reminderDays: key.rotationPolicy.reminderDays,
    });
    editForm.resetDirty();
  };

  return (
    <Container size="xl" py="xl">
      <PageHeader
        title="SSH keys"
        description="Create, import, inspect, and safely retire your local identities."
        actions={
          <Group>
            <Button
              variant="default"
              leftSection={<IconFileImport size={18} />}
              onClick={importModal.open}
            >
              Import
            </Button>
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={createModal.open}
            >
              Create key
            </Button>
          </Group>
        }
      />
      {error && (
        <Alert color="red" mb="lg">
          {error}
        </Alert>
      )}
      <Group mb="lg" justify="space-between">
        <TextInput
          leftSection={<IconKey size={16} />}
          placeholder="Search keys, fingerprints, or tags"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 420 }}
        />
        <Switch
          label="Show archived"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
        />
      </Group>

      {loading ? (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} h={230} />
          ))}
        </SimpleGrid>
      ) : filtered.length ? (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
          {filtered.map((key) => (
            <Card key={key.id} withBorder padding="lg">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group wrap="nowrap">
                  <IconKey
                    color={`var(--mantine-color-${algorithmColor(key.algorithm)}-5)`}
                  />
                  <div>
                    <Text fw={700}>{key.name}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {key.comment || "No comment"}
                    </Text>
                  </div>
                </Group>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Actions for ${key.name}`}
                    >
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconEdit size={16} />}
                      onClick={() => openEdit(key)}
                    >
                      Edit metadata
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconCopy size={16} />}
                      disabled={!key.publicKey}
                      onClick={() =>
                        void action(
                          window.sshManager.keys.copyPublic(key.id),
                          "Public key copied",
                        )
                      }
                    >
                      Copy public key
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconDownload size={16} />}
                      disabled={!key.publicKey}
                      onClick={() =>
                        void action(
                          window.sshManager.keys.exportPublic(key.id),
                          "Public key exported",
                        )
                      }
                    >
                      Export public key
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconFolderOpen size={16} />}
                      onClick={() =>
                        void action(window.sshManager.keys.reveal(key.id))
                      }
                    >
                      Reveal file
                    </Menu.Item>
                    {key.status === "archived" ? (
                      <>
                        <Menu.Item
                          leftSection={<IconRestore size={16} />}
                          onClick={() =>
                            void action(
                              window.sshManager.keys.restore(key.id),
                              "Key restored",
                            )
                          }
                        >
                          Restore
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Permanently delete ${key.name}? This cannot be undone.`,
                              )
                            )
                              void action(
                                window.sshManager.keys.deletePermanently(
                                  key.id,
                                ),
                                "Key permanently deleted",
                              );
                          }}
                        >
                          Delete permanently
                        </Menu.Item>
                      </>
                    ) : (
                      <>
                        <Menu.Item
                          leftSection={<IconRobot size={16} />}
                          disabled={!key.privateKeyPath}
                          onClick={() =>
                            void action(
                              window.sshManager.agent.add(key.id),
                              key.encrypted
                                ? "Opened ssh-add in your terminal"
                                : "Key added to SSH agent",
                            )
                          }
                        >
                          Add to agent
                        </Menu.Item>
                        <Menu.Item
                          color="yellow"
                          leftSection={<IconArchive size={16} />}
                          disabled={
                            Boolean(key.hostAliases.length) ||
                            !key.privateKeyPath
                          }
                          onClick={() => {
                            if (window.confirm(`Archive ${key.name}?`))
                              void action(
                                window.sshManager.keys.archive(key.id),
                                "Key archived",
                              );
                          }}
                        >
                          Archive
                        </Menu.Item>
                      </>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Group>
              <Group gap="xs" mt="lg">
                <Badge color={algorithmColor(key.algorithm)}>
                  {key.algorithm}
                  {key.bits ? ` ${key.bits}` : ""}
                </Badge>
                <Badge
                  variant="light"
                  color={key.encrypted ? "teal" : "yellow"}
                >
                  {key.encrypted ? "protected" : "unprotected"}
                </Badge>
                <Badge
                  variant="light"
                  color={
                    key.health === "critical"
                      ? "red"
                      : key.health === "warning"
                        ? "yellow"
                        : "teal"
                  }
                >
                  {key.health}
                </Badge>
              </Group>
              <Tooltip label={key.fingerprint}>
                <Text ff="monospace" size="xs" c="dimmed" mt="md" truncate>
                  {key.fingerprint}
                </Text>
              </Tooltip>
              <Text size="sm" mt="md">
                {key.hostAliases.length
                  ? `Used by ${key.hostAliases.join(", ")}`
                  : "Not referenced by SSH config"}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                Rotation{" "}
                {key.rotationPolicy.dueAt
                  ? `due ${new Date(key.rotationPolicy.dueAt).toLocaleDateString()}`
                  : "not scheduled"}
              </Text>
              {key.tags.length > 0 && (
                <Group gap={6} mt="md">
                  {key.tags.map((tag) => (
                    <Badge key={tag} variant="dot" color="cyan">
                      {tag}
                    </Badge>
                  ))}
                </Group>
              )}
              {key.issues.length > 0 && (
                <Alert
                  color={key.health === "critical" ? "red" : "yellow"}
                  mt="md"
                  p="xs"
                >
                  <Text size="xs">{key.issues[0]}</Text>
                </Alert>
              )}
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Card withBorder p="xl">
          <Stack align="center">
            <IconKey size={42} stroke={1.2} />
            <Title order={3}>No SSH keys found</Title>
            <Text c="dimmed">
              Create a protected key or import an existing identity.
            </Text>
            <Button onClick={createModal.open}>Create your first key</Button>
          </Stack>
        </Card>
      )}

      <Modal
        opened={createOpened}
        onClose={createModal.close}
        title="Create SSH key"
        size="lg"
      >
        <form onSubmit={submitCreate}>
          <Stack>
            <TextInput
              key={createForm.key("name")}
              label="Key name"
              placeholder="production"
              {...createForm.getInputProps("name")}
            />
            <Select
              key={createForm.key("algorithm")}
              label="Algorithm"
              data={[
                { value: "ed25519", label: "ED25519 — recommended" },
                { value: "rsa", label: "RSA 4096 — legacy compatibility" },
              ]}
              {...createForm.getInputProps("algorithm")}
            />
            <TextInput
              key={createForm.key("comment")}
              label="Comment"
              placeholder="you@example.com"
              {...createForm.getInputProps("comment")}
            />
            <TagsInput
              key={createForm.key("tags")}
              label="Tags"
              placeholder="Add a tag"
              {...createForm.getInputProps("tags")}
            />
            <PasswordInput
              key={createForm.key("passphrase")}
              label="Passphrase"
              description="Recommended. The passphrase is never logged."
              {...createForm.getInputProps("passphrase")}
            />
            <PasswordInput
              key={createForm.key("confirmPassphrase")}
              label="Confirm passphrase"
              {...createForm.getInputProps("confirmPassphrase")}
            />
            <Checkbox
              key={createForm.key("remember")}
              label="Remember passphrase in the operating system vault"
              {...createForm.getInputProps("remember", { type: "checkbox" })}
            />
            <Checkbox
              key={createForm.key("allowUnprotected")}
              color="yellow"
              label="I understand that an empty passphrase leaves the private key unprotected"
              {...createForm.getInputProps("allowUnprotected", {
                type: "checkbox",
              })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={createModal.close}>
                Cancel
              </Button>
              <Button type="submit" loading={createForm.submitting}>
                Create key
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={importOpened}
        onClose={importModal.close}
        title="Import SSH key"
        size="lg"
      >
        <form onSubmit={submitImport}>
          <Stack>
            <TextInput
              key={importForm.key("path")}
              label="Private key file"
              rightSection={
                <ActionIcon
                  variant="subtle"
                  onClick={async () => {
                    const selected =
                      await window.sshManager.keys.pickImportFile();
                    if (selected) importForm.setFieldValue("path", selected);
                  }}
                >
                  <IconFolderOpen size={17} />
                </ActionIcon>
              }
              {...importForm.getInputProps("path")}
            />
            <TextInput
              key={importForm.key("name")}
              label="Display name"
              placeholder="Defaults to filename"
              {...importForm.getInputProps("name")}
            />
            <TagsInput
              key={importForm.key("tags")}
              label="Tags"
              {...importForm.getInputProps("tags")}
            />
            <PasswordInput
              key={importForm.key("passphrase")}
              label="Passphrase, if encrypted"
              {...importForm.getInputProps("passphrase")}
            />
            <Checkbox
              key={importForm.key("remember")}
              label="Remember passphrase in the operating system vault"
              {...importForm.getInputProps("remember", { type: "checkbox" })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={importModal.close}>
                Cancel
              </Button>
              <Button type="submit" loading={importForm.submitting}>
                Import key
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        title="Key metadata"
      >
        <form
          onSubmit={editForm.onSubmit(async (values) => {
            if (!editing) return;
            await action(
              window.sshManager.keys.update({
                id: editing.id,
                name: values.name,
                tags: values.tags,
                rotationPolicy: {
                  ...editing.rotationPolicy,
                  enabled: values.enabled,
                  intervalDays: values.intervalDays,
                  reminderDays: values.reminderDays,
                },
              }),
              "Key metadata updated",
            );
            setEditing(undefined);
          })}
        >
          <Stack>
            <TextInput
              key={editForm.key("name")}
              label="Display name"
              {...editForm.getInputProps("name")}
            />
            <TagsInput
              key={editForm.key("tags")}
              label="Tags"
              {...editForm.getInputProps("tags")}
            />
            <Switch
              key={editForm.key("enabled")}
              label="Rotation reminders"
              {...editForm.getInputProps("enabled", { type: "checkbox" })}
            />
            <SegmentedControl
              data={[
                { label: "90 days", value: "90" },
                { label: "180 days", value: "180" },
                { label: "365 days", value: "365" },
              ]}
              value={String(editForm.getValues().intervalDays)}
              onChange={(value) =>
                editForm.setFieldValue("intervalDays", Number(value))
              }
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditing(undefined)}>
                Cancel
              </Button>
              <Button type="submit" loading={editForm.submitting}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}

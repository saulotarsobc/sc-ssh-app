import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconDeviceFloppy,
  IconKeyOff,
  IconSettings,
  IconShieldLock,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../shared/contracts";
import { PageHeader } from "../components/PageHeader/PageHeader";
import { useManagerQuery } from "../hooks/useManagerQuery";
import { action } from "../lib/api";

const defaults: AppSettings = {
  sshDirectory: "",
  theme: "dark",
  terminal: "auto",
  launchAtLogin: false,
  minimizeToTray: false,
  rotationIntervalDays: 90,
  rotationReminderDays: 14,
  autoOrganizeConfig: true,
};

export function SettingsPage() {
  const { setColorScheme } = useMantineColorScheme();
  const loader = useCallback(() => window.sshManager.settings.get(), []);
  const { data } = useManagerQuery(loader);
  const [vaultAvailable, setVaultAvailable] = useState(false);
  const form = useForm<AppSettings>({
    mode: "uncontrolled",
    initialValues: defaults,
    validate: {
      sshDirectory: (value) => (value ? null : "SSH directory is required"),
      rotationIntervalDays: (value) =>
        value >= 1 ? null : "Must be at least one day",
      rotationReminderDays: (value, values) =>
        value < values.rotationIntervalDays
          ? null
          : "Reminder must be earlier than rotation",
    },
  });
  useEffect(() => {
    if (data) {
      form.setValues(data);
      form.resetDirty();
    }
    // Mantine's form controller methods are stable; depending on the wrapper
    // object would rerun this synchronization after each form update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    void window.sshManager.settings
      .vaultAvailable()
      .then((result) => setVaultAvailable(result.ok && result.data));
  }, []);

  return (
    <Container size="md" py="xl">
      <PageHeader
        title="Settings"
        description="Local paths, security defaults, terminal integration, and background reminders."
      />
      <form
        onSubmit={form.onSubmit(async (values) => {
          await action(
            window.sshManager.settings.update(values),
            "Settings saved",
          );
          setColorScheme(values.theme === "system" ? "auto" : values.theme);
        })}
      >
        <Stack>
          <Card withBorder>
            <Group mb="lg">
              <IconSettings />
              <Title order={3}>General</Title>
            </Group>
            <Stack>
              <TextInput
                key={form.key("sshDirectory")}
                label="SSH directory"
                description="Changing this path reindexes keys and config without moving files."
                {...form.getInputProps("sshDirectory")}
              />
              <Select
                key={form.key("theme")}
                label="Color scheme"
                data={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "system", label: "Follow system" },
                ]}
                {...form.getInputProps("theme")}
              />
              <Select
                key={form.key("terminal")}
                label="Terminal"
                data={[
                  { value: "auto", label: "Automatic" },
                  { value: "windows-terminal", label: "Windows Terminal" },
                  { value: "terminal-app", label: "Terminal.app" },
                  { value: "x-terminal", label: "x-terminal-emulator" },
                ]}
                {...form.getInputProps("terminal")}
              />
            </Stack>
          </Card>
          <Card withBorder>
            <Group mb="lg">
              <IconShieldLock />
              <Title order={3}>Rotation policy</Title>
            </Group>
            <Stack>
              <NumberInput
                key={form.key("rotationIntervalDays")}
                label="Default rotation interval"
                suffix=" days"
                min={1}
                max={3650}
                {...form.getInputProps("rotationIntervalDays")}
              />
              <NumberInput
                key={form.key("rotationReminderDays")}
                label="Notify before due date"
                suffix=" days"
                min={0}
                max={365}
                {...form.getInputProps("rotationReminderDays")}
              />
              <Switch
                key={form.key("autoOrganizeConfig")}
                label="Keep safe host regions alphabetically organized"
                {...form.getInputProps("autoOrganizeConfig", {
                  type: "checkbox",
                })}
              />
            </Stack>
          </Card>
          <Card withBorder>
            <Group mb="lg">
              <IconKeyOff />
              <Title order={3}>Background & secrets</Title>
            </Group>
            <Stack>
              <Switch
                key={form.key("launchAtLogin")}
                label="Launch at login"
                {...form.getInputProps("launchAtLogin", { type: "checkbox" })}
              />
              <Switch
                key={form.key("minimizeToTray")}
                label="Keep running in the system tray"
                {...form.getInputProps("minimizeToTray", { type: "checkbox" })}
              />
              <Alert color={vaultAvailable ? "teal" : "yellow"}>
                {vaultAvailable
                  ? "Operating system protected storage is available. Saving secrets remains opt-in."
                  : "Secure operating system storage is unavailable. Secrets cannot be persisted."}
              </Alert>
              <Group justify="space-between">
                <div>
                  <Text fw={600}>Stored secrets</Text>
                  <Text size="sm" c="dimmed">
                    Forget all remembered server passwords and key passphrases.
                  </Text>
                </div>
                <Button
                  color="red"
                  variant="light"
                  onClick={() => {
                    if (window.confirm("Forget all stored secrets?"))
                      void action(
                        window.sshManager.settings.forgetSecrets(),
                        "Stored secrets removed",
                      );
                  }}
                >
                  Forget all
                </Button>
              </Group>
            </Stack>
          </Card>
          <Group justify="flex-end">
            <Button
              type="submit"
              leftSection={<IconDeviceFloppy size={18} />}
              loading={form.submitting}
            >
              Save settings
            </Button>
          </Group>
        </Stack>
      </form>
    </Container>
  );
}

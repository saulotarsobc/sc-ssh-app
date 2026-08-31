import type { UpdateStatus } from "@/types/update";
import { Button, Group, Progress, Text } from "@mantine/core";
import { IconDownload, IconRefreshAlert } from "@tabler/icons-react";

interface UpdateBannerProps {
  status: UpdateStatus;
}

/**
 * Footer strip showing auto-update progress. `AppLayout` mounts this only
 * once `useUpdateStatus` has something to report, so the "no update yet"
 * case never needs to be represented here.
 */
export function UpdateBanner({ status }: UpdateBannerProps) {
  return (
    <Group h="100%" px="md" gap="sm" wrap="nowrap">
      {status.state === "available" && (
        <>
          <IconDownload size={18} stroke={1.5} />
          <Text size="sm">
            New version {status.version} found, downloading…
          </Text>
        </>
      )}

      {status.state === "downloading" && (
        <>
          <IconDownload size={18} stroke={1.5} />
          <Text size="sm">
            Downloading update… {Math.round(status.percent)}%
          </Text>
          <Progress
            value={status.percent}
            w={160}
            size="sm"
            aria-label="Update download progress"
          />
        </>
      )}

      {status.state === "downloaded" && (
        <>
          <IconRefreshAlert size={18} stroke={1.5} />
          <Text size="sm">Version {status.version} is ready to install.</Text>
          <Button
            size="xs"
            onClick={() => window.ipcRenderer.invoke("update:install")}
          >
            Restart and install
          </Button>
        </>
      )}
    </Group>
  );
}

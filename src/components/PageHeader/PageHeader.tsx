import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" mb="xl">
      <Stack gap={4}>
        <Title order={1}>{title}</Title>
        <Text c="dimmed">{description}</Text>
      </Stack>
      {actions}
    </Group>
  );
}

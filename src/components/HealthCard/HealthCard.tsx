import {
  Box,
  type BoxProps,
  createVarsResolver,
  type ElementProps,
  factory,
  type Factory,
  getThemeColor,
  Group,
  Stack,
  type StylesApiProps,
  Text,
  ThemeIcon,
  useProps,
  useStyles,
} from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./HealthCard.module.css";

export type HealthCardStylesNames = "root" | "value" | "label";
export type HealthCardCssVariables = { root: "--health-accent" };
export type HealthCardFactory = Factory<{
  props: HealthCardProps;
  ref: HTMLDivElement;
  stylesNames: HealthCardStylesNames;
  vars: HealthCardCssVariables;
}>;

export interface HealthCardProps
  extends BoxProps, StylesApiProps<HealthCardFactory>, ElementProps<"div"> {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color?: string;
  hint?: string;
}

const defaultProps = { color: "teal" } satisfies Partial<HealthCardProps>;
const varsResolver = createVarsResolver<HealthCardFactory>(
  (theme, { color }) => ({
    root: { "--health-accent": getThemeColor(color, theme) },
  }),
);

export const HealthCard = factory<HealthCardFactory>((_props) => {
  const props = useProps("HealthCard", defaultProps, _props);
  const {
    ref,
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    attributes,
    label,
    value,
    icon,
    color,
    hint,
    ...others
  } = props;
  const getStyles = useStyles<HealthCardFactory>({
    name: "HealthCard",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    vars,
    attributes,
    varsResolver,
  });
  return (
    <Box ref={ref} p="lg" {...getStyles("root")} {...others}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={6}>
          <Text {...getStyles("label")}>{label}</Text>
          <Text {...getStyles("value")}>{value}</Text>
          {hint && (
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
        <ThemeIcon color={color} variant="light" size="xl" radius="md">
          {icon}
        </ThemeIcon>
      </Group>
    </Box>
  );
});

HealthCard.displayName = "HealthCard";
HealthCard.classes = classes;
HealthCard.varsResolver = varsResolver;

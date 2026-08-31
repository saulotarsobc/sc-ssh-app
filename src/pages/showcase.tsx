import {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Slider,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  Transition,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBolt,
  IconCursorText,
  IconHandFinger,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { CSSProperties, useRef, useState } from "react";
import classes from "./showcase.module.css";

const TRANSITIONS = [
  "fade",
  "fade-up",
  "scale",
  "pop",
  "rotate-left",
  "slide-up",
] as const;

type TransitionName = (typeof TRANSITIONS)[number];

function TransitionPlayground() {
  const [transition, setTransition] = useState<TransitionName>("pop");
  const [duration, setDuration] = useState(300);
  const [mounted, setMounted] = useState(true);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group mb="md">
        <IconWand size={20} />
        <Title order={4}>Transition playground</Title>
      </Group>

      <Text size="sm" c="dimmed" mb="md">
        Every Mantine overlay (Modal, Tooltip, Menu…) animates with these
        premade transitions. Pick one and toggle the card.
      </Text>

      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={transition}
          onChange={(value) => setTransition(value as TransitionName)}
          data={[...TRANSITIONS]}
        />

        <Group align="center" gap="lg">
          <Text size="sm" w={110}>
            Duration: {duration}ms
          </Text>
          <Slider
            flex={1}
            min={100}
            max={1000}
            step={50}
            value={duration}
            onChange={setDuration}
            label={(value) => `${value}ms`}
          />
          <Switch
            checked={mounted}
            onChange={(event) => setMounted(event.currentTarget.checked)}
            label="Mounted"
          />
        </Group>

        <div className={classes.stage}>
          <Transition
            mounted={mounted}
            transition={transition}
            duration={duration}
            timingFunction="ease"
          >
            {(styles) => (
              <Paper
                style={styles}
                shadow="md"
                radius="md"
                p="xl"
                withBorder
                w={280}
              >
                <Group>
                  <ThemeIcon variant="gradient" size="xl" radius="md">
                    <IconSparkles size={26} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700}>Hello there!</Text>
                    <Text size="sm" c="dimmed">
                      I animate with “{transition}”
                    </Text>
                  </div>
                </Group>
              </Paper>
            )}
          </Transition>
        </div>
      </Stack>
    </Card>
  );
}

function SkeletonDemo() {
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  const reload = () => {
    setLoading(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setLoading(false), 1600);
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
      <Group justify="space-between" mb="md">
        <Group>
          <IconCursorText size={20} />
          <Title order={4}>Skeleton loading</Title>
        </Group>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          onClick={reload}
        >
          Reload
        </Button>
      </Group>

      <Group mb="md">
        <Skeleton
          visible={loading}
          circle
          w={48}
          h={48}
          style={{ flexShrink: 0 }}
        >
          <Avatar color="blue" radius="xl" size={48}>
            SC
          </Avatar>
        </Skeleton>
        <Stack gap={6} flex={1}>
          <Skeleton visible={loading}>
            <Text fw={600}>Saulo Costa</Text>
          </Skeleton>
          <Skeleton visible={loading}>
            <Text size="sm" c="dimmed">
              Shipping desktop apps with web tech
            </Text>
          </Skeleton>
        </Stack>
      </Group>

      <Skeleton visible={loading}>
        <Text size="sm">
          Skeletons keep the layout stable while content loads, so the app never
          “jumps”. Click reload to see the shimmer — content fades back in
          exactly where it was.
        </Text>
      </Skeleton>
    </Card>
  );
}

function LoadersDemo() {
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  const simulate = () => {
    setLoading(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setLoading(false), 2000);
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
      <Group mb="md">
        <IconBolt size={20} />
        <Title order={4}>Loaders & buttons</Title>
      </Group>

      <Group gap="xl" mb="lg">
        {(["oval", "bars", "dots"] as const).map((type) => (
          <Tooltip key={type} label={type} withArrow>
            <Loader type={type} size="md" />
          </Tooltip>
        ))}
      </Group>

      <Group>
        <Button variant="filled">Filled</Button>
        <Button variant="light">Light</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="gradient">Gradient</Button>
        <Button loading={loading} onClick={simulate} variant="default">
          {loading ? "Working…" : "Click me"}
        </Button>
      </Group>
    </Card>
  );
}

function HoverCardsDemo() {
  const effects = [
    {
      className: "hover-lift",
      title: "Lift",
      description: "Rises with a soft shadow.",
      color: "teal",
    },
    {
      className: classes.glowCard,
      title: "Glow",
      description: "Border lights up in brand color.",
      color: "blue",
    },
    {
      className: classes.shineCard,
      title: "Shine",
      description: "A light sweep crosses the card.",
      color: "grape",
    },
    {
      className: classes.tiltCard,
      title: "Tilt",
      description: "Scales up with a playful tilt.",
      color: "orange",
    },
  ];

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group mb="md">
        <IconHandFinger size={20} />
        <Title order={4}>Hover effects — try me</Title>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
        {effects.map((effect) => (
          <Card
            key={effect.title}
            className={effect.className}
            padding="lg"
            radius="md"
            withBorder
          >
            <Badge variant="light" color={effect.color} mb="sm">
              {effect.title}
            </Badge>
            <Text size="sm" c="dimmed">
              {effect.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Card>
  );
}

function ModalDemo() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between">
        <Group>
          <IconRocket size={20} />
          <div>
            <Title order={4}>Animated modal</Title>
            <Text size="sm" c="dimmed">
              Overlay fades, content pops — all configurable via
              transitionProps.
            </Text>
          </div>
        </Group>
        <Button onClick={open} variant="gradient">
          Open modal
        </Button>
      </Group>

      <Modal
        opened={opened}
        onClose={close}
        title="Smooth, right?"
        centered
        radius="md"
        transitionProps={{ transition: "pop", duration: 250 }}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <Text size="sm" c="dimmed" mb="md">
          This modal uses the same Transition engine from the playground above —
          with a blurred overlay for extra polish.
        </Text>
        <Button fullWidth onClick={close}>
          Nice, close it
        </Button>
      </Modal>
    </Card>
  );
}

export function ShowcasePage() {
  return (
    <Container size="lg" py="xl">
      <Group mb="xl">
        <IconSparkles size={32} />
        <Title order={1}>Showcase</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Interactive examples of what Mantine + CSS animations can do — no extra
        animation library needed.
      </Text>

      <Stack gap="lg">
        <div className="fade-in-up">
          <TransitionPlayground />
        </div>

        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <div
              className="fade-in-up"
              style={{ "--stagger": 1 } as CSSProperties}
            >
              <SkeletonDemo />
            </div>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <div
              className="fade-in-up"
              style={{ "--stagger": 2 } as CSSProperties}
            >
              <LoadersDemo />
            </div>
          </Grid.Col>
        </Grid>

        <div className="fade-in-up" style={{ "--stagger": 3 } as CSSProperties}>
          <HoverCardsDemo />
        </div>

        <div className="fade-in-up" style={{ "--stagger": 4 } as CSSProperties}>
          <ModalDemo />
        </div>
      </Stack>
    </Container>
  );
}

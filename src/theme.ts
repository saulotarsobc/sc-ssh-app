import { Button, Card, createTheme, Modal, NavLink } from "@mantine/core";
import { HealthCard } from "./components/HealthCard/HealthCard";

const theme = createTheme({
  primaryColor: "teal",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, Cascadia Code, Consolas, monospace",
  headings: {
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
    fontWeight: "700",
  },
  colors: {
    dark: [
      "#d8e2e4",
      "#aebdc0",
      "#83989c",
      "#5d7479",
      "#41585d",
      "#2f4449",
      "#223438",
      "#18272a",
      "#101c1f",
      "#091214",
    ],
  },
  components: {
    Button: Button.extend({ defaultProps: { radius: "md" } }),
    Card: Card.extend({ defaultProps: { radius: "lg", shadow: "sm" } }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        overlayProps: { backgroundOpacity: 0.7, blur: 4 },
      },
    }),
    NavLink: NavLink.extend({ defaultProps: { variant: "light" } }),
    HealthCard: HealthCard.extend({ defaultProps: { color: "teal" } }),
  },
});

export default theme;

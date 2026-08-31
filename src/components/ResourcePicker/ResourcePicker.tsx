import {
  Combobox,
  Group,
  InputBase,
  ScrollArea,
  Stack,
  Text,
  useCombobox,
} from "@mantine/core";
import { useMemo, useState } from "react";

export interface ResourceOption {
  value: string;
  label: string;
  description?: string;
  group?: string;
}

export function ResourcePicker({
  label,
  placeholder,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  options: ResourceOption[];
  onChange: (value: string | null) => void;
  error?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const [search, setSearch] = useState(selected?.label ?? "");
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.selectFirstOption(),
  });
  const filtered = useMemo(
    () =>
      options.filter((option) =>
        `${option.label} ${option.description ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [options, search],
  );
  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(next) => {
        const option = options.find((item) => item.value === next);
        onChange(next);
        setSearch(option?.label ?? "");
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          placeholder={placeholder}
          value={search}
          error={error}
          rightSection={
            value ? (
              <Combobox.ClearButton
                onClear={() => {
                  onChange(null);
                  setSearch("");
                }}
              />
            ) : (
              <Combobox.Chevron />
            )
          }
          rightSectionPointerEvents={value ? "all" : "none"}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            if (selected && event.currentTarget.value !== selected.label)
              onChange(null);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(
              options.find((item) => item.value === value)?.label ?? "",
            );
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          <ScrollArea.Autosize mah={260}>
            {filtered.length ? (
              filtered.map((option) => (
                <Combobox.Option
                  value={option.value}
                  key={option.value}
                  active={option.value === value}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={0}>
                      <Text size="sm" fw={600}>
                        {option.label}
                      </Text>
                      {option.description && (
                        <Text size="xs" c="dimmed">
                          {option.description}
                        </Text>
                      )}
                    </Stack>
                    {option.group && (
                      <Text size="xs" c="dimmed">
                        {option.group}
                      </Text>
                    )}
                  </Group>
                </Combobox.Option>
              ))
            ) : (
              <Combobox.Empty>Nothing found for “{search}”</Combobox.Empty>
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
      <Combobox.HiddenInput
        value={value ?? ""}
        name={label.toLowerCase().replace(/\s+/g, "-")}
      />
    </Combobox>
  );
}

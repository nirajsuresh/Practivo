import * as React from "react";
import { useMemo } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
  value: string;
  label: string;
  sortKey?: string;
}

interface SearchableComboboxProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  portalContainer?: HTMLElement | null;
}

export function SearchableCombobox({
  options,
  value,
  onValueChange,
  onSearch,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  isLoading = false,
  disabled = false,
  portalContainer,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => (a.sortKey ?? a.label).localeCompare(b.sortKey ?? b.label, undefined, { numeric: true })),
    [options]
  );

  const selectedOption = options.find((option) => option.value === value);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal min-w-0", disabled && "opacity-50 cursor-not-allowed")}
          disabled={disabled}
          data-testid="combobox-trigger"
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" container={portalContainer}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={handleSearch}
            data-testid="combobox-search"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : sortedOptions.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                {sortedOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onValueChange(option.value === value ? "" : option.value);
                      setOpen(false);
                      setSearchQuery("");
                    }}
                    data-testid={`combobox-option-${option.value}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface MultiSelectComboboxProps {
  options: Option[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  portalContainer?: HTMLElement | null;
}

export function MultiSelectCombobox({
  options,
  values,
  onValuesChange,
  onSearch,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  isLoading = false,
  disabled = false,
  portalContainer,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => (a.sortKey ?? a.label).localeCompare(b.sortKey ?? b.label, undefined, { numeric: true })),
    [options]
  );

  const selectedLabels = values
    .map(v => options.find(o => o.value === v)?.label)
    .filter(Boolean)
    .join(", ");

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onValuesChange(values.filter(v => v !== val));
    } else {
      onValuesChange([...values, val]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal min-w-0", disabled && "opacity-50 cursor-not-allowed")}
          disabled={disabled}
          data-testid="combobox-multi-trigger"
        >
          <span className="truncate">
            {selectedLabels || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" container={portalContainer}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={handleSearch}
            data-testid="combobox-multi-search"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : sortedOptions.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                <CommandItem
                  value="__toggle_all__"
                  onSelect={() => {
                    if (values.length === options.length) {
                      onValuesChange([]);
                    } else {
                      onValuesChange(options.map(o => o.value));
                    }
                  }}
                  className="text-xs text-primary"
                  data-testid="combobox-multi-toggle-all"
                >
                  <Check className="mr-2 h-4 w-4 shrink-0 opacity-0" />
                  {values.length === options.length ? "Deselect all" : "Select all"}
                </CommandItem>
                {sortedOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => toggleValue(option.value)}
                    data-testid={`combobox-multi-option-${option.value}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        values.includes(option.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

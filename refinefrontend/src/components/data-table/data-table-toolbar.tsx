import type { Table } from "@tanstack/react-table";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";

export interface FilterableColumn {
  id: string;
  title: string;
  options: { label: string; value: string }[];
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchKey?: string;
  searchPlaceholder?: string;
  filterableColumns?: FilterableColumn[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder,
  filterableColumns = [],
  searchValue,
  onSearchChange,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;
  const searchColumn = searchKey ? table.getColumn(searchKey) : undefined;
  const isSearchControlled = onSearchChange !== undefined;
  const currentSearchValue = isSearchControlled
    ? searchValue ?? ""
    : ((searchColumn?.getFilterValue() as string) ?? "");

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchColumn && (
          <Input
            placeholder={searchPlaceholder ?? `Search...`}
            value={currentSearchValue}
            onChange={(event) => {
              const next = event.target.value;
              if (isSearchControlled) {
                onSearchChange(next);
              } else {
                searchColumn.setFilterValue(next);
              }
            }}
            className="h-8 w-[150px] lg:w-[250px]"
          />
        )}
        {filterableColumns.map((col) => {
          const column = table.getColumn(col.id);
          return column ? (
            <DataTableFacetedFilter
              key={col.id}
              column={column}
              title={col.title}
              options={col.options}
            />
          ) : null;
        })}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

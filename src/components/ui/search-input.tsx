import { Search } from "lucide-react";

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-[280px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-grey-2" strokeWidth={2} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-line bg-white py-[9px] pr-3.5 pl-9 text-[13px] text-ink placeholder:text-grey-2 focus:border-primary-2 focus:outline-none"
      />
    </div>
  );
}

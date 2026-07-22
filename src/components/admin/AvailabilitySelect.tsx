"use client";

import { useRef } from "react";
import { setAvailability } from "@/lib/actions/menu";

// A select that submits its parent form on change, so changing availability is
// a single tap with no separate Save button.
export function AvailabilitySelect({
  itemId,
  value,
}: {
  itemId: string;
  value: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={setAvailability} ref={formRef}>
      <input type="hidden" name="id" value={itemId} />
      <label className="sr-only" htmlFor={`avail-${itemId}`}>
        Availability
      </label>
      <select
        id={`avail-${itemId}`}
        name="availability"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-black/15 bg-white px-2 py-1 text-sm"
      >
        <option value="available">Available</option>
        <option value="sold_out">Sold out</option>
        <option value="hidden">Hidden</option>
      </select>
    </form>
  );
}

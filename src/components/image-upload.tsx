"use client";
import { useState } from "react";
export function ImageUpload({
  maxMB,
  label = "Bilde",
  required = false,
  multiple = false,
  maxFiles = 1,
}: {
  maxMB: number;
  label?: string;
  required?: boolean;
  multiple?: boolean;
  maxFiles?: number;
}) {
  const [names, setNames] = useState<string[]>([]);
  return (
    <label>
      {label}
      <input
        type="file"
        name="image"
        required={required}
        multiple={multiple}
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          setNames(files.map((file) => file.name));
          event.currentTarget.setCustomValidity(
            files.length > maxFiles
              ? `Velg høyst ${maxFiles} bilder.`
              : files.some((file) => file.size > maxMB * 1024 * 1024)
                ? `Hvert bilde kan være høyst ${maxMB} MB.`
                : "",
          );
          event.currentTarget.reportValidity();
        }}
      />
      <small className="muted">
        JPEG, PNG eller WebP · Maks {maxMB} MB
        {multiple ? ` per bilde · Opptil ${maxFiles} bilder` : ""} · Kun synlig for laget
      </small>
      {multiple && names.length > 0 && (
        <small className="upload-selection">
          {names.length} bilder valgt: {names.join(", ")}
        </small>
      )}
    </label>
  );
}

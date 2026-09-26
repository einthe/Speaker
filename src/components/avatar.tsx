"use client";
import { useContext } from "react";
import { imageWidths } from "@/lib/image-variants";
import { TeamContext } from "./team-provider";
import { LoadingImage } from "./loading-image";

export function Avatar({
  name,
  large = false,
  userId,
  path,
}: {
  name: string;
  large?: boolean;
  userId?: string;
  path?: string | null;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const responsiveImages = useContext(TeamContext)?.responsiveImages !== false;
  const src =
    userId && path
      ? `/avatars/${userId}?v=${encodeURIComponent(path)}${responsiveImages ? "" : "&w=512"}`
      : null;
  return (
    <span className={`avatar ${large ? "avatar-large" : ""}`} aria-hidden="true">
      {src ? (
        <LoadingImage
          compact
          fallback={initials}
          frameClassName="avatar-image-frame"
          key={responsiveImages ? "responsive" : "full"}
          src={src}
          srcSet={
            responsiveImages
              ? imageWidths.avatar.map((width) => `${src}&w=${width} ${width}w`).join(", ")
              : undefined
          }
          sizes={responsiveImages ? (large ? "53px" : "37px") : undefined}
          width={large ? 53 : 37}
          height={large ? 53 : 37}
          alt=""
        />
      ) : (
        initials
      )}
    </span>
  );
}

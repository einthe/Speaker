import { Fragment } from "react";
import { textLinks } from "@/lib/text-links";

export function LinkedText({ text }: { text: string }) {
  return textLinks(text).map((part, index) => (
    <Fragment key={index}>
      {part.href ? (
        <a
          href={part.href}
          target={part.href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noopener noreferrer"
        >
          {part.text}
        </a>
      ) : (
        part.text
      )}
    </Fragment>
  ));
}

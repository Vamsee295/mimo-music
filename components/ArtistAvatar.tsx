"use client";
// Round artist picture: their photo when we can find a reliable one (lib/extras artistPhoto), else the
// monogram the app always showed. Photos load lazily and are cached for the session.
import { useData } from "@/lib/useData";
import { artistPhoto } from "@/lib/extras";

export function ArtistAvatar({ name, className = "", textClass = "" }: { name: string; className?: string; textClass?: string }) {
  const { data: photo } = useData(name ? `photo:${name}` : null, () => artistPhoto(name));
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`}>
      {photo ? (
        <img src={photo} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className={textClass}>{name[0]?.toUpperCase()}</span>
      )}
    </span>
  );
}

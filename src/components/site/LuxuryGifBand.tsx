"use client";

import Image from "next/image";
import { useTheme } from "@/components/site/theme";
import { luxuryMoments } from "@/lib/studioData";

export default function LuxuryGifBand() {
  const { theme } = useTheme();

  return (
    <section className="luxuryBand reveal delay-1" aria-label="서비스 모션">
      <div className="luxuryGifGrid">
        {luxuryMoments.map((moment, index) => (
          <article
            key={moment.title}
            className={"luxuryGifCard" + (index === 0 ? " featured" : "")}
          >
            <figure className="luxuryGifMedia">
              <Image
                src={moment.gifByTheme[theme]}
                alt={moment.alt}
                className="luxuryGifImage"
                width={1440}
                height={840}
                unoptimized
                sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 34vw"
                key={`${moment.title}-${theme}`}
              />
            </figure>
          </article>
        ))}
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { journalEntries } from "@/lib/studioData";

export const metadata: Metadata = {
  title: "운영 메모",
};

export default function JournalPage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">운영 메모</p>
        <h1 className="pageTitle">운영 화면 개선 기록</h1>
        <p className="pageLead">
          화면을 바꾼 이유와 효과를 쉽게 남긴 기록입니다.
          다음 개선 때 바로 참고할 수 있도록 정리했습니다.
        </p>
      </header>

      <section className="journalGrid reveal delay-1">
        {journalEntries.map((entry) => (
          <article key={entry.title} className="essayCard">
            <p className="essayMeta">
              <span>{entry.category}</span>
              <span>{entry.readTime}</span>
            </p>
            <h2>{entry.title}</h2>
            <p>{entry.excerpt}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

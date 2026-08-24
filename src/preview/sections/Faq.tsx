import { ChevronDown } from "lucide-react";
import { faqs } from "../content";

export function Faq() {
  return (
    <section id="faq" className="preview-section preview-section-soft px-5 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.6fr_1.4fr]">
        <div data-reveal>
          <p className="preview-eyebrow">気になること</p>
          <h2 className="preview-section-title mt-4">始める前に、気になること。</h2>
        </div>
        <div className="divide-y divide-zinc-200 border-y border-zinc-200" data-reveal>
          {faqs.map((faq) => (
            <details key={faq.question} className="preview-faq group">
              <summary>
                <span>{faq.question}</span>
                <ChevronDown
                  size={18}
                  className="shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

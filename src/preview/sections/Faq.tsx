import { ChevronDown } from "lucide-react";
import { faqs } from "../content";

export function Faq() {
  return (
    <section id="faq" className="landing-section landing-section-bordered">
      <div className="landing-container landing-faq-grid">
        <div className="landing-section-heading">
          <h2>よくある質問</h2>
        </div>
        <div className="divide-y divide-zinc-200 border-y border-zinc-200">
          {faqs.map((faq) => (
            <details key={faq.question} className="preview-faq group">
              <summary>
                <span>{faq.question}</span>
                <ChevronDown size={18} className="shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

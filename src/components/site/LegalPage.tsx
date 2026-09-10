import { useI18n } from "@/lib/i18n";
import { LEGAL_DOCS, type LegalDocKey } from "@/lib/legal-content";

export function LegalPage({ doc }: { doc: LegalDocKey }) {
  const { lang } = useI18n();
  const content = LEGAL_DOCS[doc][lang] ?? LEGAL_DOCS[doc].en;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{content.title}</h1>
      <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
        {content.updated}
      </p>
      <div className="mt-8 space-y-8">
        {content.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold">{s.heading}</h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {s.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

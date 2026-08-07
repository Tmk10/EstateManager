import { z } from "zod";

export const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request w projekcie EstateManager.
Oceń podany diff w pięciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo):

1. Zgodność z regułami domenowymi — 1: łamie regułę z Hazards w CLAUDE.md (np. insert/update/delete
   na votes, recompute share_bps, próg liczony w TS zamiast SQL). 10: nie dotyka żadnej z tych reguł
   albo jawnie ją respektuje.
2. RLS i granice bezpieczeństwa — 1: nowa tabela bez kompletu 8 polityk, albo anon poza
   resolve_voting_link. 10: pełny komplet select/insert/update/delete × anon/authenticated,
   update ma using i with check.
3. Pokrycie testami względem ryzyka — 1: zero testów dla zmiany dotykającej votes/progu/RLS.
   10: odpowiedni harness uruchomiony i nazwany (npm test / test:db / test:e2e).
4. Sekrety i konfiguracja — 1: klucz/URL wklejony w kod albo commit. 10: przez secrets/astro:env,
   z obsługą null-klienta gdzie dotyczy.
5. Czytelność diffu — 1: zmiana bez uzasadnienia, martwy kod, nieusunięte placeholdery.
   10: diff czytelny bez kontekstu z rozmowy, komentarze tylko tam gdzie WHY jest nieoczywiste.

Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania)
w Markdown, na podstawie którego autor PR-a będzie mógł działać.`;

// Score'y trzymamy jako zwykłe z.number(): structured output Anthropica odrzuca
// minimum/maximum na typie integer, więc zakres 1-10 wymuszamy opisem pola i promptem,
// a nie samym schematem.
export const REVIEW_SCHEMA = z.object({
  domainRuleConformance: z
    .number()
    .describe(
      "Zgodność z regułami domenowymi z CLAUDE.md Hazards, np. votes insert/update/delete, recompute share_bps, próg w TS zamiast SQL (skala 1-10)",
    ),
  rlsSecurityBoundaries: z
    .number()
    .describe(
      "RLS i granice bezpieczeństwa: komplet 8 polityk na nowej tabeli, anon tylko przez resolve_voting_link (skala 1-10)",
    ),
  testCoverageForRisk: z
    .number()
    .describe("Pokrycie testami proporcjonalne do ryzyka zmienianych ścieżek — votes, próg, RLS (skala 1-10)"),
  secretsAndConfig: z
    .number()
    .describe("Sekrety i konfiguracja: przez secrets/astro:env, bez kluczy/URL-i wklejonych w kod (skala 1-10)"),
  diffReadability: z
    .number()
    .describe(
      "Czytelność diffu bez kontekstu z rozmowy, komentarze tylko tam gdzie WHY jest nieoczywiste (skala 1-10)",
    ),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

// Konfiguracja pola target zapewnia zgodność między zodem a Claude Agent SDK
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: "draft-07" });

export type Review = z.infer<typeof REVIEW_SCHEMA>;

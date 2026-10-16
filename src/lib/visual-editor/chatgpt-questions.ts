export type ChatgptQuestion = { question: string; choices: string[]; choiceCandidateIds?: (string | null)[] };
export const CHATGPT_MAX_VISUAL_CHOICES = 12;
/** UI metadata comes from resolved candidates, never model-generated URLs. */
export type ChatgptChoicePreview =
  | { kind: "sky"; name: string; catalogId: string }
  | { kind: "builtin"; name: string; candidateId: string }
  | { kind: "project"; name: string; assetId: string }
  | { kind: "remote"; name: string; thumbnailUrl: string };
export type ChatgptQuestionAnswer = { questionIndex: number; answer: string };

export function parseChatgptQuestions(raw: unknown): ChatgptQuestion[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 3) throw new Error("確認事項を読み取れませんでした");
  return raw.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("確認事項を読み取れませんでした");
    const question = value as Record<string, unknown>;
    if (Object.keys(question).some(key => !["question", "choices", "choiceCandidateIds"].includes(key)) || typeof question.question !== "string" || !question.question.trim() || question.question.length > 240
      || !Array.isArray(question.choices) || question.choices.length < 3 || question.choices.length > CHATGPT_MAX_VISUAL_CHOICES || question.choices.some(choice => typeof choice !== "string" || !choice.trim() || choice.length > 160) || new Set(question.choices.map(choice => typeof choice === "string" ? choice.trim() : choice)).size !== question.choices.length) throw new Error("確認事項を読み取れませんでした");
    const candidates = question.choiceCandidateIds;
    if (candidates != null && (!Array.isArray(candidates) || candidates.length !== question.choices.length || candidates.some(id => id !== null && (typeof id !== "string" || !id.trim() || id.length > 320)) || new Set(candidates.filter(id => id !== null)).size !== candidates.filter(id => id !== null).length)) throw new Error("確認事項の素材を読み取れませんでした");
    if (question.choices.length > 3 && (!Array.isArray(candidates) || candidates.some(id => id === null))) throw new Error("確認事項の素材を読み取れませんでした");
    return { question: question.question.trim(), choices: question.choices.map(choice => String(choice).trim()), ...(Array.isArray(candidates) ? { choiceCandidateIds: candidates as (string | null)[] } : {}) };
  });
}

export function validateChatgptQuestionAnswers(questions: readonly ChatgptQuestion[], raw: unknown): ChatgptQuestionAnswer[] {
  if (!Array.isArray(raw) || !questions.length || raw.length !== questions.length) throw new Error("すべての確認事項に回答してください");
  return questions.map((_question, index) => {
    const answers = raw.filter(value => value?.questionIndex === index);
    const answer = answers[0]?.answer;
    if (answers.length !== 1 || typeof answer !== "string" || !answer.trim() || answer.length > 500) throw new Error("回答を選ぶか、その他の内容を入力してください");
    return { questionIndex: index, answer: answer.trim() };
  });
}

/** Bounded display metadata only. Renderers resolve exact local catalog IDs. */
export function restoreChatgptChoicePreview(raw: unknown): ChatgptChoicePreview | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string") return undefined;
  const name = value.name.slice(0, 80);
  if (value.kind === "sky" && typeof value.catalogId === "string" && /^[a-z0-9-]{1,100}$/.test(value.catalogId)) return { kind: "sky", name, catalogId: value.catalogId as string };
  if (value.kind === "builtin" && typeof value.candidateId === "string" && value.candidateId.length <= 320 && /^builtin:(?:xrift-water-shaders|xrift-terrain-presets|xrift-glow-materials|xrift-particle-presets|xrift-scene-recipes|xrift-material-showcases|xrift-gimmicks|xrift-components|open-brush):[a-zA-Z0-9._/-]+$/.test(value.candidateId)) return { kind: "builtin", name, candidateId: value.candidateId };
  if (value.kind === "project" && typeof value.assetId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value.assetId)) return { kind: "project", name, assetId: value.assetId };
  if (value.kind === "remote" && typeof value.thumbnailUrl === "string" && value.thumbnailUrl.length <= 2048) {
    try { const url = new URL(value.thumbnailUrl); if (url.protocol === "https:" && !url.username && !url.password) return { kind: "remote", name, thumbnailUrl: url.href }; } catch { /* Invalid stored metadata is omitted. */ }
  }
  return undefined;
}

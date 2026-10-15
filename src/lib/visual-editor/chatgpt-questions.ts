export type ChatgptQuestion = { question: string; choices: string[]; choiceCandidateIds?: (string | null)[] };
/** UI metadata comes from resolved candidates, never model-generated URLs. */
export type ChatgptChoicePreview =
  | { kind: "sky"; name: string; catalogId: string }
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
      || !Array.isArray(question.choices) || question.choices.length !== 3 || question.choices.some(choice => typeof choice !== "string" || !choice.trim() || choice.length > 160) || new Set(question.choices.map(choice => typeof choice === "string" ? choice.trim() : choice)).size !== 3) throw new Error("確認事項を読み取れませんでした");
    const candidates = question.choiceCandidateIds;
    if (candidates != null && (!Array.isArray(candidates) || candidates.length !== 3 || candidates.some(id => id !== null && (typeof id !== "string" || !id.trim() || id.length > 320)))) throw new Error("確認事項の素材を読み取れませんでした");
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

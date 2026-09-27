/**
 * An optional browser password-manager path for the XRift publishing key.
 * The application never writes the key to Web Storage or project files.
 */
const CREDENTIAL_ID = "xrift-studio:world-publishing-api-key";

type BrowserPasswordCredential = Credential & { readonly password: string };
type PasswordCredentialConstructor = new (options: {
  id: string;
  name: string;
  password: string;
}) => Credential;

function passwordCredentialConstructor(): PasswordCredentialConstructor | null {
  if (typeof window === "undefined" || !window.isSecureContext || window.top !== window.self) {
    return null;
  }
  const constructor = (window as Window & {
    PasswordCredential?: PasswordCredentialConstructor;
  }).PasswordCredential;
  if (!constructor || !navigator.credentials?.get || !navigator.credentials?.store) {
    return null;
  }
  return constructor;
}

export function canUseBrowserPasswordManager(): boolean {
  return passwordCredentialConstructor() !== null;
}

/** Returns only the credential created for this specific publishing feature. */
export async function readSavedXriftApiKey(
  mediation: "silent" | "required" = "silent",
): Promise<string | null> {
  if (!canUseBrowserPasswordManager()) return null;
  const options = { password: true, mediation } as CredentialRequestOptions;
  const credential = await navigator.credentials.get(options);
  if (credential?.type !== "password" || credential.id !== CREDENTIAL_ID) return null;
  const password = (credential as BrowserPasswordCredential).password;
  return typeof password === "string" && password.length > 0 ? password : null;
}

/** A resolved store() does not prove that the user accepted the browser's save prompt. */
export async function askBrowserToSaveXriftApiKey(key: string): Promise<"verified" | "unverified"> {
  const Constructor = passwordCredentialConstructor();
  if (!Constructor) throw new Error("このブラウザはパスワード管理機能からの保存に対応していません。");
  await navigator.credentials.store(new Constructor({
    id: CREDENTIAL_ID,
    name: "XRift ワールド公開 APIキー",
    password: key,
  }));
  try {
    // A freshly saved credential can still require user mediation. A silent
    // read may return null even though the browser has stored the key.
    return await readSavedXriftApiKey("required") === key ? "verified" : "unverified";
  } catch {
    // Saving may have succeeded even if the browser disallows a read.
    return "unverified";
  }
}

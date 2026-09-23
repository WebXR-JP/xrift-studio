import { parseWhoami } from "./xrift-cli";

export function runXriftCliFixtureAssertions(): void {
  for (const output of [
    "",
    "Not logged in",
    "Fetching user info...\n\u001b[31mToken is invalid\u001b[0m",
    "A new version of XRift CLI is available!\nCurrent version: 0.24.3\nLatest version: 0.24.4",
  ]) {
    assert(parseWhoami(output) === null, "CLI status text must not become a logged-in account");
  }

  const account = parseWhoami(
    "\u001b[34mDisplay Name:\u001b[0m CLI 検証 (Test)\nUser ID: user-fixture\nLogged in",
  );
  assert(account?.displayName === "CLI 検証 (Test)", "Official CLI account name must remain intact");
  assert(account?.id === "user-fixture", "Official CLI labelled account IDs are opaque strings");

  const namedAfterStatus = parseWhoami("Display Name: Not logged in\nUser ID: user-fixture\nLogged in");
  assert(namedAfterStatus?.displayName === "Not logged in", "A display name is not an authentication status");

  const idOnly = parseWhoami("User ID: user-fixture\nLogged in");
  assert(idOnly?.id === "user-fixture" && idOnly.displayName === null, "A missing name must not be replaced by a spinner message or an ID");
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

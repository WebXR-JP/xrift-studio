declare module "monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js" {
  type TranspileDiagnostic = {
    category: number;
    start?: number;
    messageText: unknown;
    file?: {
      getLineAndCharacterOfPosition(position: number): {
        line: number;
        character: number;
      };
    };
  };

  type TranspileResult = {
    outputText: string;
    diagnostics?: readonly TranspileDiagnostic[];
  };

  type TypeScriptServices = {
    transpileModule(
      source: string,
      options: {
        compilerOptions: Readonly<Record<string, unknown>>;
        fileName: string;
        reportDiagnostics: boolean;
      },
    ): TranspileResult;
    flattenDiagnosticMessageText(
      messageText: unknown,
      newLine: string,
    ): string;
  };

  export const typescript: TypeScriptServices;
}

import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, args: string[], onLine?: (line: string) => void, env: NodeJS.ProcessEnv = process.env) {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, { env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      text.split(/\r?\n/).filter(Boolean).forEach((line) => onLine?.(line));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      text.split(/\r?\n/).filter(Boolean).forEach((line) => onLine?.(line));
    });

    child.on("error", (error) => {
      stderr += error.message;
      onLine?.(error.message);
      resolve({ code: 127, stdout, stderr });
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

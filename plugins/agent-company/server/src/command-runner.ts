// 외부 명령 실행을 런타임에서 교체 가능하게 감싼다.
import { spawn } from "node:child_process";
import type { CommandResult, CommandRunner } from "./types.ts";

export class DefaultCommandRunner implements CommandRunner {
  run(command: string, args: string[], options: { cwd?: string } = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ stdout, stderr, code });
      });
    });
  }
}

export async function requireSuccessful(
  runner: CommandRunner,
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<CommandResult> {
  const result = await runner.run(command, args, options);
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

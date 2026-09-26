import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/prisma";

// Lê a senha sem mostrá-la na tela: cada caractere digitado vira um "*"
function lerSenha(pergunta: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(pergunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let senha = "";

    const aoDigitar = (entrada: string) => {
      for (const tecla of entrada) {
        if (tecla === "\r" || tecla === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", aoDigitar);
          stdout.write("\n");
          resolve(senha);
          return;
        }
        if (tecla === "\u0003") {
          // Ctrl + C
          stdout.write("\nCancelado.\n");
          process.exit(1);
        }
        if (tecla === "\u007f" || tecla === "\b") {
          // Backspace
          if (senha.length > 0) {
            senha = senha.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        senha += tecla;
        stdout.write("*");
      }
    };

    stdin.on("data", aoDigitar);
  });
}

async function main() {
  if (!stdin.isTTY) {
    throw new Error("Execute este script diretamente no terminal.");
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const nome = (await rl.question("Nome: ")).trim();
  const email = (await rl.question("E-mail: ")).trim().toLowerCase();
  const papelDigitado = (await rl.question("Papel (ADMIN ou OPERADOR) [OPERADOR]: "))
    .trim()
    .toUpperCase();
  rl.close();

  if (nome.length < 2) throw new Error("Informe o nome.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
  if (papelDigitado !== "" && papelDigitado !== "ADMIN" && papelDigitado !== "OPERADOR") {
    throw new Error("Papel deve ser ADMIN ou OPERADOR.");
  }
  const papel = papelDigitado === "ADMIN" ? "ADMIN" : "OPERADOR";

  const senha = await lerSenha("Senha (mínimo 8 caracteres): ");
  const confirmacao = await lerSenha("Confirme a senha: ");
  if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  if (senha !== confirmacao) throw new Error("As senhas não conferem.");

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) throw new Error(`Já existe um usuário com o e-mail ${email}.`);

  const id = randomUUID();
  const hash = await hashPassword(senha);

  const usuario = await prisma.usuario.create({
    data: {
      id,
      nome,
      email,
      papel,
      contas: {
        create: {
          id: randomUUID(),
          providerId: "credential",
          accountId: id,
          password: hash,
        },
      },
    },
  });

  console.log(`\nUsuário criado: ${usuario.email} (${usuario.papel})`);
}

main()
  .catch((erro: unknown) => {
    console.error(`\nErro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
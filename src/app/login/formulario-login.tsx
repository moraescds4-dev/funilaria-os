"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

const estadoInicial: EstadoLogin = { erro: null, email: "" };

export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState(entrar, estadoInicial);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={estado.email}
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="senha" className="text-sm font-medium text-gray-700">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-gray-900 focus:outline-none"
        />
      </div>

      {estado.erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-gray-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
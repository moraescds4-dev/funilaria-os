"use client";

import { startTransition, useActionState, useState } from "react";
import type { VeiculoCadastrado } from "@/server/veiculos";
import { cadastrarOrdemServico, type EstadoNovaOrdem } from "./actions";

const estadoInicial: EstadoNovaOrdem = { erros: {}, mensagem: null, valores: {} };

const classeCampo =
  "rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-gray-900 focus:outline-none";

/** Rótulo + campo + primeira mensagem de erro do servidor. */
function Campo({
  id,
  rotulo,
  erros,
  children,
}: {
  id: string;
  rotulo: string;
  erros?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {rotulo}
      </label>
      {children}
      {erros?.[0] && <p className="text-sm text-red-700">{erros[0]}</p>}
    </div>
  );
}

/** Opção de rádio grande, fácil de tocar no celular. */
function Opcao({
  name,
  value,
  marcado,
  aoMarcar,
  children,
}: {
  name: string;
  value: string;
  marcado: boolean;
  aoMarcar: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-gray-300 px-3 py-3 text-base has-[:checked]:border-gray-900 has-[:checked]:bg-gray-100">
      <input type="radio" name={name} value={value} checked={marcado} onChange={aoMarcar} />
      {children}
    </label>
  );
}

type Props = {
  placa: string;
  veiculo: VeiculoCadastrado | null;
  /** Telefone do proprietário já formatado; vazio em placa nova. */
  telefoneProprietario: string;
};

export function FormularioNovaOrdem({ placa, veiculo, telefoneProprietario }: Props) {
  const [estado, acao, enviando] = useActionState(cadastrarOrdemServico, estadoInicial);
  const v = estado.valores;
  const e = estado.erros;

  // Controlam o que aparece na tela; também vão no formulário.
  const [acaoProprietario, setAcaoProprietario] = useState(v.acaoProprietario ?? "manter");
  const [responsavel, setResponsavel] = useState(v.responsavelEhProprietario ?? "sim");

  const pedirDadosDoProprietario = !veiculo || acaoProprietario === "trocar";

  return (

    <form
      action={acao}
      onSubmit={(evento) => {
        // Envia sem a limpeza automática do React 19: campos e opções
        // continuam exatamente como o usuário deixou.
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="placa" value={placa} />

      {/* ── Veículo ─────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-semibold text-gray-900">Veículo</legend>
        <Campo id="modelo" rotulo="Modelo" erros={e.modelo}>
          <input
            id="modelo"
            name="modelo"
            defaultValue={v.modelo ?? veiculo?.modelo ?? ""}
            className={classeCampo}
          />
        </Campo>
        <Campo id="cor" rotulo="Cor (opcional)" erros={e.cor}>
          <input
            id="cor"
            name="cor"
            defaultValue={v.cor ?? veiculo?.cor ?? ""}
            className={classeCampo}
          />
        </Campo>
      </fieldset>

      {/* ── Proprietário ────────────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-semibold text-gray-900">Proprietário</legend>

        {veiculo && (
          <div className="flex flex-col gap-2">
            <Opcao
              name="acaoProprietario"
              value="manter"
              marcado={acaoProprietario === "manter"}
              aoMarcar={() => setAcaoProprietario("manter")}
            >
              Continua sendo {veiculo.proprietario.nome}
            </Opcao>
            <Opcao
              name="acaoProprietario"
              value="trocar"
              marcado={acaoProprietario === "trocar"}
              aoMarcar={() => setAcaoProprietario("trocar")}
            >
              Trocou de dono (veículo vendido)
            </Opcao>
          </div>
        )}

        {pedirDadosDoProprietario ? (
          // key: ao alternar manter/trocar, os campos começam limpos
          <div key="novo" className="flex flex-col gap-4">
            <Campo id="nomeCliente" rotulo="Nome do proprietário" erros={e.nomeCliente}>
              <input
                id="nomeCliente"
                name="nomeCliente"
                autoComplete="off"
                defaultValue={v.nomeCliente ?? ""}
                className={classeCampo}
              />
            </Campo>
            <Campo id="telefone" rotulo="Telefone do proprietário" erros={e.telefone}>
              <input
                id="telefone"
                name="telefone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="(11) 98765-4321"
                defaultValue={v.telefone ?? ""}
                className={classeCampo}
              />
            </Campo>
          </div>
        ) : (
          veiculo && (
            <div key="manter" className="flex flex-col gap-4">
              {/* O nome não muda em "manter"; vai oculto só para a validação. */}
              <input type="hidden" name="nomeCliente" value={veiculo.proprietario.nome} />
              <Campo id="telefone" rotulo="Confirme o telefone do proprietário" erros={e.telefone}>
                <input
                  id="telefone"
                  name="telefone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  defaultValue={v.telefone ?? telefoneProprietario}
                  className={classeCampo}
                />
              </Campo>
            </div>
          )
        )}
      </fieldset>

      {/* ── Responsável pela OS ─────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-semibold text-gray-900">
          O proprietário é quem está trazendo o veículo?
        </legend>
        <div className="flex gap-2">
          <div className="flex-1">
            <Opcao
              name="responsavelEhProprietario"
              value="sim"
              marcado={responsavel === "sim"}
              aoMarcar={() => setResponsavel("sim")}
            >
              Sim
            </Opcao>
          </div>
          <div className="flex-1">
            <Opcao
              name="responsavelEhProprietario"
              value="nao"
              marcado={responsavel === "nao"}
              aoMarcar={() => setResponsavel("nao")}
            >
              Não
            </Opcao>
          </div>
        </div>

        {responsavel === "nao" && (
          <>
            <Campo id="responsavelNome" rotulo="Nome do responsável" erros={e.responsavelNome}>
              <input
                id="responsavelNome"
                name="responsavelNome"
                autoComplete="off"
                defaultValue={v.responsavelNome ?? ""}
                className={classeCampo}
              />
            </Campo>
            <Campo
              id="responsavelTelefone"
              rotulo="Telefone do responsável"
              erros={e.responsavelTelefone}
            >
              <input
                id="responsavelTelefone"
                name="responsavelTelefone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                defaultValue={v.responsavelTelefone ?? ""}
                className={classeCampo}
              />
            </Campo>
          </>
        )}
      </fieldset>

      {/* ── Serviço ─────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-semibold text-gray-900">Serviço</legend>
        <Campo id="descricaoServico" rotulo="Descrição do serviço" erros={e.descricaoServico}>
          <textarea
            id="descricaoServico"
            name="descricaoServico"
            rows={3}
            defaultValue={v.descricaoServico ?? ""}
            className={classeCampo}
          />
        </Campo>
        <Campo id="valorOrcamento" rotulo="Valor do orçamento (opcional)" erros={e.valorOrcamento}>
          <input
            id="valorOrcamento"
            name="valorOrcamento"
            inputMode="decimal"
            placeholder="1.500,00"
            defaultValue={v.valorOrcamento ?? ""}
            className={classeCampo}
          />
        </Campo>
        <Campo id="previsaoEntrega" rotulo="Previsão de entrega (opcional)" erros={e.previsaoEntrega}>
          <input
            id="previsaoEntrega"
            name="previsaoEntrega"
            type="date"
            defaultValue={v.previsaoEntrega ?? ""}
            className={`${classeCampo} w-full`}
          />
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erros={e.observacoes}>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={2}
            defaultValue={v.observacoes ?? ""}
            className={classeCampo}
          />
        </Campo>
      </fieldset>

      {estado.mensagem && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.mensagem}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-gray-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {enviando ? "Salvando..." : "Cadastrar OS"}
      </button>
    </form>
  );
}